import { DEFAULT_BASE_URL, RESPONSES } from './spec.js';

// ZenRows asks clients for at least 180 s: a request can take up to 3 minutes,
// and one cut short on the client side still runs, and can still be charged.
const DEFAULT_TIMEOUT = 180_000;

export interface ZenrowsClientOptions {
  /** ZenRows API key. Falls back to the `ZENROWS_API_KEY` environment variable. */
  apiKey?: string;
  /** Base URL of the API. Falls back to `ZENROWS_API_URL`, then the public API. */
  baseUrl?: string;
  /** Milliseconds to wait for one request. Defaults to 180000. */
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

export class ZenrowsError extends Error {
  readonly status: number;
  /** The API's error code, such as `REQS004` or `REQS007`, when the body carried one. */
  readonly code?: string;
  /** Why, for codes that have several causes: `domain_not_prepared` on a `REQS007`, for example. */
  readonly reason?: string;
  readonly detail?: string;

  constructor(status: number, problem: { code?: string; reason?: string; detail?: string }) {
    const label = [status, problem.code, problem.reason && `(${problem.reason})`].filter(Boolean).join(' ');
    super([`ZenRows answered ${label}.`, problem.detail, RESPONSES[status]].filter(Boolean).join(' '));
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

function toError(status: number, body: string): ZenrowsError {
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
  return new ZenrowsError(status, {
    code: field('code'),
    reason: field('reason'),
    detail: field('detail') ?? (field('code') ? undefined : body.trim().slice(0, 500) || undefined),
  });
}

function endpoint(baseUrl: string): URL {
  return new URL(`${baseUrl.replace(/\/+$/, '')}/`);
}

export async function requestZenrows(options: ZenrowsClientOptions, params: ZenrowsParams): Promise<ZenrowsResponse> {
  const apiKey = options.apiKey ?? process.env.ZENROWS_API_KEY;
  if (!apiKey) {
    throw new Error('ZenRows API key is required. Pass { apiKey } or set the ZENROWS_API_KEY environment variable.');
  }

  const url = endpoint(options.baseUrl ?? process.env.ZENROWS_API_URL ?? DEFAULT_BASE_URL);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const timeout = options.timeout && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw toError(response.status, body);
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type'),
      credits: parseCredits(response.headers.get('x-request-credits')),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `ZenRows did not answer within ${timeout} ms. The request may still finish and be charged, so check before retrying.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
