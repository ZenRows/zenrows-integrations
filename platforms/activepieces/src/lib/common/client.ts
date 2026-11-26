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
  // An empty ID would turn /jobs/{job_id} into /jobs/, which lists every job
  // and succeeds: a mapped value that came out empty fails the step instead.
  const path = operation.path.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
    if (!given(name)) {
      throw new Error(`Zenrows: ${name} is empty. Check the value mapped into it.`);
    }
    return encodeURIComponent(String(values[name]));
  });
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

// Custom API Call attaches the key to whatever URL the step holds, and that URL
// can come from an earlier step: only HTTPS to the Zenrows API gets the key,
// and never with redirects on, which could carry it elsewhere.
function apiKeyHeaderFor({ apiKey, url, followRedirects }: { apiKey: string; url: unknown; followRedirects: unknown }): Record<string, string> {
  // The url prop is a group: { url: '<what the user typed>' }.
  const value = typeof url === 'object' && url !== null && 'url' in url ? url.url : url;
  const target = typeof value === 'string' ? value.trim() : '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(target);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== 'https:' || !ZENROWS_API_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Zenrows: Custom API Call only sends your API key to https://${ZENROWS_API_HOSTS.join(' or https://')}. Use a path such as /subscriptions/self/details, or a full URL on one of those hosts.`);
    }
  }
  if (followRedirects === true) {
    throw new Error('Zenrows: turn off Follow redirects. The Zenrows API does not redirect, and a redirect could carry your API key to another host.');
  }
  return { 'X-API-Key': apiKey };
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
  const hint = (problem.tag ? ERROR_HINTS[`${problem.code}:${problem.tag}`] : undefined) ?? ERROR_HINTS[problem.code];
  return new Error(`Zenrows error ${problem.code} (HTTP ${status}): ${problem.reason}${hint ? ` ${hint}` : ''}`);
}

// tag is the API's machine-readable reason, where it gives one: REQS007's
// domain_not_prepared and page_not_recognised need different next steps.
function parseProblem({ body }: { body: unknown }): { code: string; reason: string; tag?: string } | null {
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
  const { code, detail, title, reason } = body as Record<string, unknown>;
  if (typeof code !== 'string') {
    return null;
  }
  return {
    code,
    reason: typeof detail === 'string' ? detail : typeof title === 'string' ? title : 'Request failed',
    ...(typeof reason === 'string' ? { tag: reason } : {}),
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
// A hint keyed "CODE:reason" applies only to that reason; REQS007 has no hint
// of its own, because its reasons need opposite next steps.
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
  'REQS007:domain_not_prepared': 'Prepare the domain with Request Extract Domain, then retry once Get Extract Domain Status reports ready.',
  'REQS007:page_not_recognised': sentence({{text:reqs007-page-not-recognised}}, 'Point Extract at a page with the data, such as a product page.'),
};

export const ZENROWS_API_BASE_URL = {{api:GET / server}};

// The hosts the API is served from (Batch has its own), the only ones that get the key.
export const ZENROWS_API_HOSTS = [new URL(ZENROWS_API_BASE_URL).hostname, new URL({{api:POST /jobs server}}).hostname];

// The parameters the actions send, as the published API spec defines them
// (rendered from it): a name the API doesn't take fails the build, and the
// actions take each one's description from here.
export const FETCH_PARAMS = {{api:GET / query url,mode,js_render,js_instructions,response_type,screenshot,screenshot_fullpage,screenshot_format,custom_headers}} as const;
export type FetchParams = Partial<Record<keyof typeof FETCH_PARAMS.properties, string>>;
// The values the spec allows for a parameter with an enum, for example response_type.
export type FetchValue<P extends keyof typeof FETCH_PARAMS.properties> = (typeof FETCH_PARAMS.properties)[P] extends { enum: readonly (infer V)[] } ? V : string;

export const zenrowsClient = {
  apiKeyHeaderFor,
  callOperation,
  fetchPage,
  readHeader,
};
