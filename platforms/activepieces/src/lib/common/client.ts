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

async function fetchPage({
  apiKey,
  params,
  forwardedHeaders,
  binary,
}: {
  apiKey: string;
  params: Record<string, string>;
  forwardedHeaders?: Record<string, string>;
  binary?: boolean;
}): Promise<HttpResponse> {
  try {
    return await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `${ZENROWS_API_BASE_URL}/`,
      queryParams: { apikey: apiKey, ...params },
      headers: forwardedHeaders ?? CLIENT_HEADERS,
      timeout: FETCH_TIMEOUT_MS,
      responseType: binary ? 'arraybuffer' : undefined,
    });
  } catch (error) {
    throw toZenrowsError({ error });
  }
}

function toZenrowsError({ error }: { error: unknown }): unknown {
  if (!(error instanceof HttpError)) {
    return error;
  }
  const { status, body } = error.response;
  const problem = parseProblem({ body });
  if (!problem) {
    return error;
  }
  const hint = isExtractRefusal({ code: problem.code })
    ? REQS007_HINTS[problem.extractCase ?? ''] ?? ERROR_HINTS['REQS007']
    : ERROR_HINTS[problem.code];
  return new Error(
    `ZenRows error ${problem.code} (HTTP ${status}): ${problem.reason}${hint ? ` ${hint}` : ''}`
  );
}

function readHeader({
  headers,
  name,
}: {
  headers: HttpHeaders | undefined;
  name: string;
}): string | null {
  const value = headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function parseProblem({ body }: { body: unknown }): ZenrowsProblem | null {
  if (typeof body === 'string') {
    try {
      return parseProblem({ body: JSON.parse(body) });
    } catch {
      return null;
    }
  }
  if (!isRecord(body) || typeof body['code'] !== 'string') {
    return null;
  }
  const detail = body['detail'];
  const title = body['title'];
  return {
    code: body['code'],
    reason:
      typeof detail === 'string'
        ? detail
        : typeof title === 'string'
          ? title
          : 'Request failed',
    extractCase: readExtractCase({ body }),
  };
}

// REQS007 (or the older AUTH010) says why Extract refused a page in its
// "reason" field. Until every API release sends it, the title tells the cases
// apart: https://docs.zenrows.com/api-error-codes#REQS007
function readExtractCase({ body }: { body: Record<string, unknown> }): string | undefined {
  if (typeof body['reason'] === 'string') {
    return body['reason'];
  }
  const title = body['title'];
  if (typeof title !== 'string') {
    return undefined;
  }
  return REQS007_TITLES.find(([prefix]) => title.startsWith(prefix))?.[1];
}

function isExtractRefusal({ code }: { code: string }): boolean {
  return code === 'REQS007' || code === 'AUTH010';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const FETCH_TIMEOUT_MS = 180000;

const CLIENT_HEADERS = { 'X-ZenRows-Client': 'activepieces' };

const AUTH_HINT = 'Check the API key in your ZenRows connection.';

// The facts in {{text:…}} come from zenrows-integrations' shared/text/, the same
// wording the Zenrows skills use; each hint adds what to do in Activepieces.
function sentence(fact: string, next: string): string {
  return `${fact.charAt(0).toUpperCase()}${fact.slice(1)}. ${next}`;
}

const ERROR_HINTS: Record<string, string> = {
  AUTH001: AUTH_HINT,
  AUTH002: AUTH_HINT,
  AUTH003: AUTH_HINT,
  AUTH004: sentence({{text:auth004}}, 'Top up or upgrade at https://app.zenrows.com.'),
  AUTH014: sentence({{text:auth014}}, 'Raise the cap in the ZenRows dashboard.'),
  REQS002:
    'This page needs JS rendering and/or premium proxies. Turn on Adaptive Stealth Mode, or enable them manually.',
  REQS007:
    'Extract refused this page, and nothing was charged. Use the CSS selectors method, or see https://docs.zenrows.com/api-error-codes#REQS007.',
  AUTH006: sentence({{text:auth006}}, 'Reduce parallel runs and retry.'),
  AUTH008: 'Rate limit reached. Wait a moment and retry.',
  RESP009: 'ZenRows is temporarily at capacity. Retry in a few seconds.',
};

export const ZENROWS_API_BASE_URL = 'https://api.zenrows.com/v1';

const REQS007_TITLES: [string, string][] = [
  ['Extract is not prepared for the requested domain', 'domain_not_prepared'],
  ['Extract did not recognise this page on', 'page_not_recognised'],
  ['Extract is not enabled for the requested domain', 'domain_not_enabled'],
];

const REQS007_HINTS: Record<string, string> = {
  domain_not_prepared:
    'ZenRows has not prepared this domain for automatic extraction yet. Prepare it with the Custom API Call action: POST /extract/prepared-domains with the domain and 1 to 5 example URLs. It takes a few minutes and costs no credits. Meanwhile, use the CSS selectors method.',
  page_not_recognised: sentence(
    {{text:reqs007-page-not-recognised}},
    'Try a product, article or listing page, or the CSS selectors method. Preparing the domain again does not change it.'
  ),
  domain_not_enabled:
    'Automatic extraction is not enabled for this site, and preparing it does not help. Use the CSS selectors method, or contact ZenRows support.',
};

export const zenrowsClient = {
  request,
  fetchPage,
  toZenrowsError,
  readHeader,
};

type ZenrowsProblem = {
  code: string;
  reason: string;
  extractCase?: string;
};
