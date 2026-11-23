import { randomUUID } from 'crypto';
import {
  HttpError,
  HttpHeaders,
  HttpMethod,
  HttpResponse,
  httpClient,
} from '@activepieces/pieces-common';

// One API operation as the generated actions describe it (generated.ts): the
// values go into the path, the query or the JSON body by name; empty ones are left out.
type Operation = {
  method: string;
  server: string;
  path: string;
  key: 'header' | 'query';
  query?: string[];
  body?: string[];
  // The spec says it can answer with a file (a PDF, an image): read it as bytes.
  binary?: boolean;
  // The spec says it answers with NDJSON: one JSON value per line, returned as a list.
  lines?: boolean;
};

// Where a generated action saves a file the API answers with (Activepieces' context.files).
type Files = { write: (file: { fileName: string; data: Buffer }) => Promise<string> };

async function callOperation({
  apiKey,
  operation,
  values,
  files,
}: {
  apiKey: string;
  operation: Operation;
  values: Record<string, unknown>;
  files?: Files;
}): Promise<unknown> {
  const given = (name: string) => values[name] !== undefined && values[name] !== null && values[name] !== '';
  const path = operation.path.replace(/\{([a-z_]+)\}/g, (_, name: string) => encodeURIComponent(String(values[name])));
  const queryParams: Record<string, string> = {};
  for (const name of (operation.query ?? []).filter(given)) {
    queryParams[name] = String(values[name]);
  }
  if (operation.key === 'query') {
    queryParams['apikey'] = apiKey;
  }
  const body = operation.body
    ? Object.fromEntries(operation.body.filter(given).map((name) => [name, values[name]]))
    : undefined;
  try {
    const response = await httpClient.sendRequest({
      method: operation.method as HttpMethod,
      url: `${operation.server}${path}`,
      queryParams,
      headers: {
        ...(operation.key === 'header' ? { 'X-API-Key': apiKey } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...CLIENT_HEADERS,
      },
      body,
      timeout: FETCH_TIMEOUT_MS,
      ...(operation.binary ? { responseType: 'arraybuffer' as const } : {}),
      ...(operation.lines ? { responseType: 'text' as const } : {}),
    });
    if (operation.lines) {
      return readLines({ text: String(response.body ?? '') });
    }
    return operation.binary ? await readBinary({ response, files }) : response.body;
  } catch (error) {
    throw toZenrowsError({ error });
  }
}

// A response read as bytes: JSON comes back parsed, text as text, and a file
// is saved with files.write and comes back as its URL. The API labels some JSON
// text/plain (an Extract result, for one), so text that parses as a JSON object
// or list comes back parsed too.
async function readBinary({ response, files }: { response: HttpResponse; files?: Files }): Promise<unknown> {
  const data = Buffer.from(response.body as ArrayBuffer);
  const contentType = readHeader({ headers: response.headers, name: 'Content-Type' }) ?? '';
  if (contentType.includes('json')) {
    return JSON.parse(data.toString('utf8'));
  }
  if (contentType.startsWith('text/plain')) {
    return parseJsonText({ text: data.toString('utf8') });
  }
  if (contentType.startsWith('text/') || !files) {
    return data.toString('utf8');
  }
  const extension = contentType.split(';')[0].split('/')[1] || 'bin';
  return { file_url: await files.write({ fileName: `zenrows-${randomUUID()}.${extension}`, data }) };
}

function parseJsonText({ text }: { text: string }): unknown {
  if (!/^\s*[[{]/.test(text)) {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// NDJSON as a list, the same shape for no lines, one or many.
function readLines({ text }: { text: string }): unknown[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

// responseType: 'text' keeps a page as it is (a JSON page would otherwise come
// back parsed), 'arraybuffer' is for a screenshot.
async function fetchPage({
  apiKey,
  params,
  forwardedHeaders,
  responseType,
}: {
  apiKey: string;
  params: FetchParams;
  forwardedHeaders?: Record<string, string>;
  responseType: 'text' | 'arraybuffer';
}): Promise<HttpResponse> {
  try {
    return await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `${ZENROWS_API_BASE_URL}/`,
      queryParams: { apikey: apiKey, ...params },
      // With custom_headers=true Zenrows passes every header on to the site, so
      // the user's headers replace ours rather than carry X-ZenRows-Client there.
      headers: forwardedHeaders ?? CLIENT_HEADERS,
      timeout: FETCH_TIMEOUT_MS,
      responseType,
    });
  } catch (error) {
    throw toZenrowsError({ error });
  }
}

// The API answers every failure with a code and a reason
// (https://docs.zenrows.com/api-error-codes); the message keeps both, and adds
// what to do next for the codes where Activepieces changes the answer.
function toZenrowsError({ error }: { error: unknown }): unknown {
  if (!(error instanceof HttpError)) {
    return error;
  }
  const { status, body } = error.response;
  const problem = parseProblem({ body });
  if (!problem) {
    return error;
  }
  const hint = ERROR_HINTS[problem.code];
  return new Error(`Zenrows error ${problem.code} (HTTP ${status}): ${problem.reason}${hint ? ` ${hint}` : ''}`);
}

function parseProblem({ body }: { body: unknown }): { code: string; reason: string } | null {
  if (typeof body === 'string') {
    try {
      return parseProblem({ body: JSON.parse(body) });
    } catch {
      return null;
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const { code, detail, title } = body as Record<string, unknown>;
  if (typeof code !== 'string') {
    return null;
  }
  return {
    code,
    reason: typeof detail === 'string' ? detail : typeof title === 'string' ? title : 'Request failed',
  };
}

function readHeader({ headers, name }: { headers: HttpHeaders | undefined; name: string }): string | null {
  const value = headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

const FETCH_TIMEOUT_MS = 180000;

const CLIENT_HEADERS = { 'X-ZenRows-Client': 'activepieces' };

const AUTH_HINT = 'Check the API key in your Zenrows connection.';

// The facts below come from zenrows-integrations' shared/text/, the same
// wording the Zenrows skills use; each hint adds what to do in Activepieces.
function sentence(fact: string, next: string): string {
  return `${fact.charAt(0).toUpperCase()}${fact.slice(1)}. ${next}`;
}

const ERROR_HINTS: Record<string, string> = {
  AUTH001: AUTH_HINT,
  AUTH002: AUTH_HINT,
  AUTH003: AUTH_HINT,
  AUTH004: sentence({{text:auth004}}, 'Top up or upgrade at https://app.zenrows.com.'),
  AUTH006: sentence({{text:auth006}}, 'Run fewer flows at once, or retry in a moment.'),
  AUTH014: sentence({{text:auth014}}, 'Raise the cap in the Zenrows dashboard.'),
  REQS002: 'This page needs JS rendering or premium proxies: turn on Adaptive Stealth Mode.',
  REQS007: sentence({{text:reqs007-page-not-recognised}}, 'Point Extract at a page with the data, such as a product page.'),
};

export const ZENROWS_API_BASE_URL = {{api:GET / server}};

// The parameters the actions send, as the published API spec defines them
// (rendered from it): a name the API doesn't take fails the build, and the
// actions take each one's description from here.
export const FETCH_PARAMS = {{api:GET / query url,mode,js_render,js_instructions,response_type,screenshot,screenshot_fullpage,screenshot_format,custom_headers}} as const;
export type FetchParams = Partial<Record<keyof typeof FETCH_PARAMS.properties, string>>;
// The values the spec allows for a parameter with an enum, for example response_type.
export type FetchValue<P extends keyof typeof FETCH_PARAMS.properties> = (typeof FETCH_PARAMS.properties)[P] extends { enum: readonly (infer V)[] } ? V : string;

export const zenrowsClient = {
  callOperation,
  fetchPage,
  readHeader,
};
