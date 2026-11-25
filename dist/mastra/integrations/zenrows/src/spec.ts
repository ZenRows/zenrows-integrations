// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.

export const DEFAULT_BASE_URL: string = 'https://api.zenrows.com/v1';

// What each response status of a fetch means, keyed by status.
export const RESPONSES: Record<string, string> = {
  '200':
    "The target's content, in the shape the request asked for: HTML by default, Markdown or plaintext with `response_type`, a PDF or PNG/JPEG binary for `response_type=pdf` and the screenshot parameters, and JSON for `extract`, `css_extractor`, `autoparse` or `json_response`.",
  '400':
    '`REQS004`: the request is malformed, or a parameter combination is not allowed. The combinations Fetch rejects: `mode=auto` with `js_render` or `premium_proxy`; `proxy_country` alone or with only `js_render`; `json_response`, `js_instructions` or `screenshot` without `js_render=true` or `mode=auto`; `response_type=pdf` without `js_render=true`; `response_type` (any value) with `outputs`.',
  '401': 'The API key is missing or invalid.',
  '402': 'The account is out of credits, or the plan does not include this capability.',
  '403':
    'With `extract=auto`, error `REQS007`: the domain, or this kind of page on it, has not been prepared for Extract yet. The message names the domain. The request is not charged and no HTML is returned. Prepare the domain with `requestExtractDomain`, then retry once it reports `ready`. Documented at https://docs.zenrows.com/api-error-codes#REQS007.',
  '422':
    'Zenrows reached the target but could not return it under the requested configuration. With `extract`, the lowercase code `no_data_extracted` means something else: Extract knows this kind of page and applied its extraction, but no field came back filled. That answer is not charged, carries no HTML, and comes back the same on a retry, so do not retry it; check that the page rendered fully instead. The lowercase code `blocked_document` means the page Zenrows fetched was a bot challenge, an error page or a page that had not finished loading, so Extract had nothing real to read. It is not charged either; retry with `js_render=true` and/or `premium_proxy=true`, or with Adaptive Stealth Mode (`mode=auto`). Documented at https://docs.zenrows.com/api-error-codes#no_data_extracted.',
  '429':
    'Error `AUTH008`: every concurrency slot on the plan is occupied. There is no fixed requests-per-minute quota to wait out and no Retry-After to read: a slot frees when one of your requests in flight finishes. Read `Concurrency-Remaining` on any response to pace yourself, and back off exponentially before retrying. Documented at https://docs.zenrows.com/api-error-codes#AUTH008 and https://docs.zenrows.com/fetch/features/concurrency.',
};

export const FETCH_SUMMARY = 'Fetch a page';
export const EXTRACT_SUMMARY = 'Extract structured data from a page';
export const CREDIT_WEIGHTS =
  '1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan';
export const EXTRACT_NO_CREDITS = 'Extract adds no credits on top of the request it runs';
export const REQUEST_TIMEOUT =
  'a request can take up to 3 minutes, so wait at least 180 seconds for it, and a request cut short on the client side still runs and can still be charged';
export const REQUEST_EXTRACT_DOMAIN_TOOL = 'zenrows-request-extract-domain';
export const GET_EXTRACT_DOMAIN_STATUS_TOOL = 'zenrows-get-extract-domain-status';
