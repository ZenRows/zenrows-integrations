import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestZenrows, ZenrowsError } from '../client.js';

const responses: Record<string, string> = {{api:fetch responses}};

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
