import {
  HttpError,
  HttpHeaders,
  HttpMessageBody,
  HttpMethod,
  HttpResponse,
  httpClient,
} from '@activepieces/pieces-common';

async function request<TResponse extends HttpMessageBody>({
  apiKey,
  method,
  path,
  body,
}: {
  apiKey: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
}): Promise<TResponse> {
  try {
    const response = await httpClient.sendRequest<TResponse>({
      method,
      url: `${ZENROWS_API_BASE_URL}${path}`,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        ...CLIENT_HEADERS,
      },
      body,
    });
    return response.body;
  } catch (error) {
    throw toZenrowsError({ error });
  }
}

// One API operation as the generated actions describe it (generated.ts): the
// values go into the path, the query or the JSON body by name; empty ones are left out.
type Operation = {
  method: string;
  server: string;
  path: string;
  key: 'header' | 'query';
  query?: string[];
  body?: string[];
};

async function callOperation({
  apiKey,
  operation,
  values,
}: {
  apiKey: string;
  operation: Operation;
  values: Record<string, unknown>;
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
    });
    return response.body;
  } catch (error) {
    throw toZenrowsError({ error });
  }
}

// responseType: 'text' keeps a page as it is (a JSON page would otherwise come
// back parsed), 'json' is for Extract's output, 'arraybuffer' for a screenshot.
async function fetchPage({
  apiKey,
  params,
  forwardedHeaders,
  responseType,
}: {
  apiKey: string;
  params: FetchParams;
  forwardedHeaders?: Record<string, string>;
  responseType: 'text' | 'json' | 'arraybuffer';
}): Promise<HttpResponse> {
  try {
    return await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `${ZENROWS_API_BASE_URL}/`,
      queryParams: { apikey: apiKey, ...params },
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
  return new Error(`ZenRows error ${problem.code} (HTTP ${status}): ${problem.reason}${hint ? ` ${hint}` : ''}`);
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

const AUTH_HINT = 'Check the API key in your ZenRows connection.';

// The facts below come from zenrows-integrations' shared/text/, the same
// wording the Zenrows skills use; each hint adds what to do in Activepieces.
function sentence(fact: string, next: string): string {
  return `${fact.charAt(0).toUpperCase()}${fact.slice(1)}. ${next}`;
}

const ERROR_HINTS: Record<string, string> = {
  AUTH001: AUTH_HINT,
  AUTH002: AUTH_HINT,
  AUTH003: AUTH_HINT,
  AUTH004: sentence("the account's credit allowance is spent", 'Top up or upgrade at https://app.zenrows.com.'),
  AUTH014: sentence("this API key reached its credit cap", 'Raise the cap in the ZenRows dashboard.'),
  REQS002: 'This page needs JS rendering or premium proxies: turn on Adaptive Stealth Mode.',
};

export const ZENROWS_API_BASE_URL = "https://api.zenrows.com/v1";

// The parameters the actions send, as the published API spec defines them
// (rendered from it): a name the API doesn't take fails the build, and the
// actions take each one's description from here. Extract is the shared slice
// of GET / (zenrows-integrations' shared/endpoints.yaml).
export const FETCH_PARAMS = {"type":"object","properties":{"url":{"type":"string","format":"uri","examples":["https://www.scrapingcourse.com/ecommerce/"],"description":"The URL of the page to retrieve."},"mode":{"type":"string","enum":["auto"],"description":"Adaptive Stealth Mode. `auto` starts from the cheapest viable configuration and escalates to JavaScript rendering or premium proxies only when the target requires it. You are billed for the configuration that succeeds."},"js_render":{"type":"boolean","default":false,"description":"Render the page in a headless browser before returning it. Required for content that only exists after JavaScript runs."},"js_instructions":{"type":"string","description":"JSON array of browser instructions (click, fill, scroll, wait) executed on the page before the content is returned. Requires js_render."},"response_type":{"type":"string","enum":["markdown","plaintext","pdf"],"description":"Convert the page before returning it: Markdown, plaintext or PDF."},"screenshot_fullpage":{"type":"boolean","default":false,"description":"Return a full-page screenshot. Requires js_render."},"screenshot_format":{"type":"string","enum":["png","jpeg"],"default":"png","description":"Screenshot image format."},"custom_headers":{"type":"boolean","default":false,"description":"Forward your own request headers (cookies, referer) to the target."}},"required":["url"]} as const;
export const EXTRACT_PARAMS = {"type":"object","properties":{"url":{"type":"string","format":"uri","examples":["https://www.scrapingcourse.com/ecommerce/"],"description":"The URL of the page to retrieve."},"extract":{"type":"string","enum":["auto","native","standard"],"description":"Return structured JSON extracted from the page with no selectors to write (Extract). Omit it and Extract is off. `auto` and `native` return the website's own field names; `standard` returns a canonical schema shared by every website in a vertical (real estate only for now). Extract works on any prepared domain, with any active API key (prepare a new one with `POST /extract/prepared-domains`), and is currently free on top of the Fetch cost. A domain, or a kind of page on it, that is not prepared yet answers 403 `REQS007`: see `requestExtractDomain`."},"extract_fields":{"type":"string","examples":["products.name,products.price"],"description":"Comma-separated list of the fields `extract` should return, dot-notated for fields inside a group (for example `products.name,products.price`). Omit it to receive every field."},"css_extractor":{"type":"string","examples":["{\"title\":\"h1\",\"price\":\".price\"}"],"description":"JSON object mapping output keys to CSS selectors, applied to the retrieved page."},"mode":{"type":"string","enum":["auto"],"description":"Adaptive Stealth Mode. `auto` starts from the cheapest viable configuration and escalates to JavaScript rendering or premium proxies only when the target requires it. You are billed for the configuration that succeeds."},"js_render":{"type":"boolean","default":false,"description":"Render the page in a headless browser before returning it. Required for content that only exists after JavaScript runs."},"premium_proxy":{"type":"boolean","default":false,"description":"Route the request through residential IPs. Required by most protected sites."},"proxy_country":{"type":"string","pattern":"^[a-z]{2}$","examples":["us"],"description":"Two-letter country code for the exit IP. Requires premium_proxy."}},"required":["url"]} as const;
type FetchParam = keyof typeof FETCH_PARAMS.properties | keyof typeof EXTRACT_PARAMS.properties;
export type FetchParams = Partial<Record<FetchParam, string>>;
// The values the spec allows for a parameter with an enum, for example response_type.
export type FetchValue<P extends keyof typeof FETCH_PARAMS.properties> = (typeof FETCH_PARAMS.properties)[P] extends { enum: readonly (infer V)[] } ? V : string;

export const zenrowsClient = {
  request,
  callOperation,
  fetchPage,
  readHeader,
};
