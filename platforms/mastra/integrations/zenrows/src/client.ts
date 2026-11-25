import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT, REQUEST_TIMEOUT, RESPONSES } from './spec.js';

export interface ZenrowsClientOptions {
  /** Zenrows API key. Falls back to the `ZENROWS_API_KEY` environment variable. */
  apiKey?: string;
  /** Base URL of the API. Falls back to `ZENROWS_API_URL`, then the public API. */
  baseUrl?: string;
  /** Milliseconds to wait for one request. Defaults to DEFAULT_TIMEOUT, the wait Zenrows asks clients for. */
  timeout?: number;
  /** Custom `fetch` implementation. */
  fetch?: typeof fetch;
}

export type ZenrowsParams = Record<string, string | boolean | number | undefined>;

export interface ZenrowsResponse {
  status: number;
  body: string;
  contentType: string | null;
  /** Credits the request used, from the `X-Request-Credits` header; null when the header is missing. */
  credits: number | null;
}

/** One API operation as a generated tool describes it (src/generated/). */
export interface ZenrowsOperation {
  method: string;
  /** The operation's server in the spec. `baseUrl` replaces it only where it is the public API's. */
  server: string;
  /** The path, with `{name}` for each path parameter. */
  path: string;
  /** Where the operation takes the key: the `X-API-Key` header, or the `apikey` query parameter. */
  key: 'header' | 'query';
  /** The inputs that go in the query string. */
  query?: readonly string[];
  /** The inputs that go in the JSON body. */
  body?: readonly string[];
  /** What each response status means, from the spec. */
  responses: Readonly<Record<string, string>>;
}

export class ZenrowsError extends Error {
  readonly status: number;
  /** The API's error code, such as `REQS004` or `REQS007`, when the body carried one. */
  readonly code?: string;
  /** Why, for codes that have several causes: `domain_not_prepared` on a `REQS007`, for example. */
  readonly reason?: string;
  readonly detail?: string;

  constructor(
    status: number,
    problem: { code?: string; reason?: string; detail?: string },
    responses: Readonly<Record<string, string>> = RESPONSES,
  ) {
    const label = [status, problem.code, problem.reason && `(${problem.reason})`].filter(Boolean).join(' ');
    super([`Zenrows answered ${label}.`, problem.detail, responses[status]].filter(Boolean).join(' '));
    this.name = 'ZenrowsError';
    this.status = status;
    this.code = problem.code;
    this.reason = problem.reason;
    this.detail = problem.detail;
  }
}

function parseCredits(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number(header);
}

function toError(status: number, body: string, responses?: Readonly<Record<string, string>>): ZenrowsError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  const field = (name: string) => {
    const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[name] : undefined;
    return typeof value === 'string' && value ? value : undefined;
  };
  return new ZenrowsError(
    status,
    {
      code: field('code'),
      reason: field('reason'),
      detail: field('detail') ?? (field('code') ? undefined : body.trim().slice(0, 500) || undefined),
    },
    responses,
  );
}

function apiKeyFrom(options: ZenrowsClientOptions): string {
  const apiKey = options.apiKey ?? process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    throw new Error('Zenrows API key is required. Pass { apiKey } or set the ZENROWS_API_KEY environment variable.');
  }
  return apiKey;
}

function baseUrlFrom(options: ZenrowsClientOptions): string {
  return options.baseUrl ?? process.env.ZENROWS_API_URL ?? DEFAULT_BASE_URL;
}

// One request with the timeout; a failure status throws a ZenrowsError.
async function send(
  options: ZenrowsClientOptions,
  url: URL,
  init: RequestInit,
  responses?: Readonly<Record<string, string>>,
): Promise<Response> {
  const timeout = options.timeout && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // Which integration sent the request: X-ZenRows-Client for Zenrows, as every
    // host here sends it, and mastra in the User-Agent, as Mastra's packages add it.
    const headers = new Headers(init.headers);
    headers.set('X-ZenRows-Client', 'mastra');
    headers.set('User-Agent', [headers.get('User-Agent'), 'mastra'].filter(Boolean).join(' '));
    const response = await (options.fetch ?? globalThis.fetch)(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw toError(response.status, await response.text(), responses);
    // Read the body before the timer is cleared, so a stalled body times out too.
    const body = await response.arrayBuffer();
    return new Response(response.status === 204 ? null : body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Zenrows did not answer within ${timeout} ms. ${REQUEST_TIMEOUT.charAt(0).toUpperCase()}${REQUEST_TIMEOUT.slice(1)}, so check before retrying.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestZenrows(options: ZenrowsClientOptions, params: ZenrowsParams): Promise<ZenrowsResponse> {
  const apiKey = apiKeyFrom(options);
  const url = new URL(`${baseUrlFrom(options).replace(/\/+$/, '')}/`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const response = await send(options, url, { method: 'GET', headers: { 'X-API-Key': apiKey } });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type'),
    credits: parseCredits(response.headers.get('x-request-credits')),
  };
}

/** A response that is neither JSON nor text, such as a PDF. */
export interface ZenrowsFile {
  contentType: string;
  base64: string;
}

/**
 * Calls one API operation with the tool's input: path parameters fill the path,
 * the names in `operation.query` go in the query string and those in
 * `operation.body` in a JSON body; an undefined value is left out. Returns JSON
 * parsed, text as a string, any other body as a `ZenrowsFile`, and null for an
 * empty body.
 */
export async function callOperation(
  options: ZenrowsClientOptions,
  operation: ZenrowsOperation,
  input: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = apiKeyFrom(options);
  const server = operation.server === DEFAULT_BASE_URL ? baseUrlFrom(options) : operation.server;
  const path = operation.path.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name: string) => {
    const value = input[name];
    if (value === undefined || value === '') throw new Error(`${name} is required.`);
    return encodeURIComponent(String(value));
  });
  const url = new URL(`${server.replace(/\/+$/, '')}${path}`);
  for (const name of operation.query ?? []) {
    if (input[name] !== undefined) url.searchParams.set(name, String(input[name]));
  }
  if (operation.key === 'query') url.searchParams.set('apikey', apiKey);

  const headers: Record<string, string> = operation.key === 'header' ? { 'X-API-Key': apiKey } : {};
  let body: string | undefined;
  if (operation.body) {
    body = JSON.stringify(
      Object.fromEntries(operation.body.filter(name => input[name] !== undefined).map(name => [name, input[name]])),
    );
    headers['Content-Type'] = 'application/json';
  }

  const response = await send(options, url, { method: operation.method, headers, body }, operation.responses);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return null;
  const contentType = response.headers.get('content-type') ?? '';
  const text = () => new TextDecoder().decode(bytes);
  if (/[/+]json\b/.test(contentType)) return JSON.parse(text()) as unknown;
  if (contentType.startsWith('text/') || /ndjson/.test(contentType)) return text();
  return { contentType, base64: Buffer.from(bytes).toString('base64') } satisfies ZenrowsFile;
}
