import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestZenrows, ZenrowsError } from '../client.js';

const responses: Record<string, string> = {"200":"The target's content, in the shape the request asked for: HTML by default, Markdown or plaintext with `response_type`, a PDF or PNG/JPEG binary for `response_type=pdf` and the screenshot parameters, and JSON for `extract`, `css_extractor`, `autoparse` or `json_response`.","400":"`REQS004`: the request is malformed, or a parameter combination is not allowed. The combinations Fetch rejects: `mode=auto` with `js_render` or `premium_proxy`; `proxy_country` alone or with only `js_render`; `json_response`, `js_instructions` or `screenshot` without `js_render=true` or `mode=auto`; `response_type=pdf` without `js_render=true`; `response_type` (any value) with `outputs`.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","403":"With `extract=auto`, error `REQS007`: the domain, or this kind of page on it, has not been prepared for Extract yet. The message names the domain. The request is not charged and no HTML is returned. Prepare the domain with `requestExtractDomain`, then retry once it reports `ready`. Documented at https://docs.zenrows.com/api-error-codes#REQS007.","422":"Zenrows reached the target but could not return it under the requested configuration. With `extract`, the lowercase code `no_data_extracted` means something else: Extract knows this kind of page and applied its extraction, but no field came back filled. That answer is not charged, carries no HTML, and comes back the same on a retry, so do not retry it; check that the page rendered fully instead. The lowercase code `blocked_document` means the page Zenrows fetched was a bot challenge, an error page or a page that had not finished loading, so Extract had nothing real to read. It is not charged either; retry with `js_render=true` and/or `premium_proxy=true`, or with Adaptive Stealth Mode (`mode=auto`). Documented at https://docs.zenrows.com/api-error-codes#no_data_extracted.","429":"Error `AUTH008`: every concurrency slot on the plan is occupied. There is no fixed requests-per-minute quota to wait out and no Retry-After to read: a slot frees when one of your requests in flight finishes. Read `Concurrency-Remaining` on any response to pace yourself, and back off exponentially before retrying. Documented at https://docs.zenrows.com/api-error-codes#AUTH008 and https://docs.zenrows.com/fetch/features/concurrency."};

const fetchMock = vi.fn<typeof fetch>();
const problem = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } });
const sentUrl = () => new URL(String(fetchMock.mock.calls[0]![0]));
const sentHeaders = () => new Headers(fetchMock.mock.calls[0]![1]!.headers);

async function rejection(promise: Promise<unknown>): Promise<ZenrowsError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ZenrowsError);
  return error as ZenrowsError;
}

describe('requestZenrows', () => {
  const saved = { key: process.env.ZENROWS_API_KEY, url: process.env.ZENROWS_API_URL };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('ok', { headers: { 'X-Request-Credits': '5' } }));
    delete process.env.ZENROWS_API_KEY;
    delete process.env.ZENROWS_API_URL;
  });

  afterEach(() => {
    for (const [name, value] of [
      ['ZENROWS_API_KEY', saved.key],
      ['ZENROWS_API_URL', saved.url],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('sends the key in the X-API-Key header and never in the URL', async () => {
    await requestZenrows({ apiKey: 'secret-key', fetch: fetchMock }, { url: 'https://example.com/' });

    expect(sentHeaders().get('X-API-Key')).toBe('secret-key');
    expect(sentUrl().toString()).not.toContain('secret-key');
    expect(sentUrl().searchParams.has('apikey')).toBe(false);
  });

  it('sends a GET to the public API by default', async () => {
    await requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' });

    expect(fetchMock.mock.calls[0]![1]!.method).toBe('GET');
    expect(`${sentUrl().origin}${sentUrl().pathname}`).toBe('https://api.zenrows.com/v1/');
  });

  it('reads the key and the base URL from the environment', async () => {
    process.env.ZENROWS_API_KEY = 'env-key';
    process.env.ZENROWS_API_URL = 'http://localhost:8080/v1';

    await requestZenrows({ fetch: fetchMock }, { url: 'https://example.com/' });

    expect(sentHeaders().get('X-API-Key')).toBe('env-key');
    expect(`${sentUrl().origin}${sentUrl().pathname}`).toBe('http://localhost:8080/v1/');
  });

  it('prefers the options over the environment', async () => {
    process.env.ZENROWS_API_KEY = 'env-key';
    process.env.ZENROWS_API_URL = 'http://env.example/v1/';

    await requestZenrows(
      { apiKey: 'option-key', baseUrl: 'http://option.example/v1/', fetch: fetchMock },
      { url: 'https://example.com/' },
    );

    expect(sentHeaders().get('X-API-Key')).toBe('option-key');
    expect(sentUrl().origin).toBe('http://option.example');
  });

  it('serializes booleans and numbers, and leaves out undefined parameters', async () => {
    await requestZenrows(
      { apiKey: 'k', fetch: fetchMock },
      { url: 'https://example.com/', js_render: true, premium_proxy: false, wait: 500, wait_for: undefined },
    );

    expect(Object.fromEntries(sentUrl().searchParams)).toEqual({
      url: 'https://example.com/',
      js_render: 'true',
      premium_proxy: 'false',
      wait: '500',
    });
  });

  it('returns the body, content type and credits', async () => {
    fetchMock.mockResolvedValue(
      new Response('# Example', { headers: { 'Content-Type': 'text/markdown', 'X-Request-Credits': '25' } }),
    );

    const response = await requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' });

    expect(response).toEqual({ status: 200, body: '# Example', contentType: 'text/markdown', credits: 25 });
  });

  it.each([
    ['missing', undefined],
    ['not a number', 'n/a'],
  ])('reports credits as null when the header is %s', async (_, header) => {
    fetchMock.mockResolvedValue(new Response('ok', { headers: header ? { 'X-Request-Credits': header } : {} }));

    const response = await requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' });

    expect(response.credits).toBeNull();
  });

  it('fails at request time, before any call, when no key is set', async () => {
    await expect(requestZenrows({ fetch: fetchMock }, { url: 'https://example.com/' })).rejects.toThrow(
      'ZenRows API key is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'AUTH002', 'Invalid API key.'],
    [402, 'AUTH004', 'Usage exceeded.'],
    [400, 'REQS004', 'mode=auto cannot be combined with js_render.'],
    [429, 'AUTH008', 'Too many concurrent requests.'],
  ])('turns a %i %s into a ZenrowsError with the API detail and what the spec says the status means', async (status, code, detail) => {
    fetchMock.mockResolvedValue(problem(status, { code, detail, status }));

    const error = await rejection(requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' }));

    expect(error).toMatchObject({ status, code, detail });
    expect(error.message).toContain(`${status} ${code}`);
    expect(error.message).toContain(detail);
    expect(error.message).toContain(responses[status]);
  });

  it('carries the reason of a 403 REQS007', async () => {
    fetchMock.mockResolvedValue(
      problem(403, { code: 'REQS007', reason: 'domain_not_prepared', detail: 'Extract has not been prepared for example.com yet.' }),
    );

    const error = await rejection(requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' }));

    expect(error).toMatchObject({ status: 403, code: 'REQS007', reason: 'domain_not_prepared' });
    expect(error.message).toContain('403 REQS007 (domain_not_prepared)');
    expect(error.message).toContain(responses['403']);
  });

  it('keeps the body of an error that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await rejection(requestZenrows({ apiKey: 'k', fetch: fetchMock }, { url: 'https://example.com/' }));

    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.message).toContain('ZenRows answered 502.');
    expect(error.message).toContain('Bad gateway');
  });

  it('gives up after the timeout and says the request may still be charged', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    await expect(
      requestZenrows({ apiKey: 'k', timeout: 20, fetch: fetchMock }, { url: 'https://example.com/' }),
    ).rejects.toThrow('ZenRows did not answer within 20 ms');
  });
});
