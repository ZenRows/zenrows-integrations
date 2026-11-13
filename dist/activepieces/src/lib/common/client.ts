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

// responseType: 'text' keeps a page as it is (a JSON page would otherwise come
// back parsed), 'json' is for Extract's output, 'arraybuffer' for a screenshot.
async function fetchPage({
  apiKey,
  params,
  forwardedHeaders,
  responseType,
}: {
  apiKey: string;
  params: Record<string, string>;
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

export const ZENROWS_API_BASE_URL = 'https://api.zenrows.com/v1';

export const zenrowsClient = {
  request,
  fetchPage,
  readHeader,
};
