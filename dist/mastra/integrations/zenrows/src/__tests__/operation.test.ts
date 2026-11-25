import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callOperation, ZenrowsError } from '../client.js';
import type { ZenrowsOperation } from '../client.js';
import { DEFAULT_BASE_URL } from '../spec.js';

const fetchMock = vi.fn<typeof fetch>();
const sent = () => ({ url: new URL(String(fetchMock.mock.calls[0]![0])), init: fetchMock.mock.calls[0]![1]! });

const job: ZenrowsOperation = {
  method: 'GET',
  server: 'https://async.example.com/v1',
  path: '/jobs/{job_id}/results',
  key: 'header',
  query: ['status', 'cursor'],
  responses: { '404': 'No such job.' },
};
const crawl: ZenrowsOperation = {
  method: 'POST',
  server: DEFAULT_BASE_URL,
  path: '/crawls',
  key: 'query',
  body: ['url', 'max_pages', 'include_patterns'],
  responses: {},
};

describe('callOperation', () => {
  const saved = process.env.ZENROWS_API_URL;

  beforeEach(() => {
    fetchMock.mockReset();
    // A fresh Response per call: a body can be read once.
    fetchMock.mockImplementation(async () => Response.json({ ok: true }));
    delete process.env.ZENROWS_API_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ZENROWS_API_URL;
    else process.env.ZENROWS_API_URL = saved;
  });

  it('fills the path, sends the named query parameters and the key in X-API-Key', async () => {
    await callOperation({ apiKey: 'k', fetch: fetchMock }, job, { job_id: 'J 1', status: 'failed', cursor: undefined });

    const { url, init } = sent();
    expect(url.toString()).toBe('https://async.example.com/v1/jobs/J%201/results?status=failed');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('X-API-Key')).toBe('k');
    expect(init.body).toBeUndefined();
  });

  it('sends the named body fields as JSON, and the key as apikey where the operation takes it so', async () => {
    await callOperation({ apiKey: 'k', fetch: fetchMock }, crawl, {
      url: 'https://example.com/',
      max_pages: 2,
      include_patterns: ['/product/'],
      depth: 3,
    });

    const { url, init } = sent();
    expect(url.searchParams.get('apikey')).toBe('k');
    expect(new Headers(init.headers).get('X-API-Key')).toBeNull();
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      url: 'https://example.com/',
      max_pages: 2,
      include_patterns: ['/product/'],
    });
  });

  it('takes baseUrl for the public API server only', async () => {
    await callOperation({ apiKey: 'k', baseUrl: 'http://localhost:8080/v1/', fetch: fetchMock }, crawl, {});
    await callOperation({ apiKey: 'k', baseUrl: 'http://localhost:8080/v1/', fetch: fetchMock }, job, { job_id: 'J' });

    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^http:\/\/localhost:8080\/v1\/crawls\?/);
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/^https:\/\/async\.example\.com\/v1\/jobs\/J\/results/);
  });

  it.each([
    ['JSON, parsed', Response.json({ id: 'C1' }), { id: 'C1' }],
    [
      'problem JSON, parsed',
      new Response('{"a":1}', { headers: { 'Content-Type': 'application/problem+json' } }),
      { a: 1 },
    ],
    ['text, as a string', new Response('<p>hi</p>', { headers: { 'Content-Type': 'text/html' } }), '<p>hi</p>'],
    [
      'NDJSON, as a string',
      new Response('{"url":"a"}\n{"url":"b"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }),
      '{"url":"a"}\n{"url":"b"}\n',
    ],
    [
      'a file, as base64',
      new Response(new Uint8Array([37, 80, 68, 70]), { headers: { 'Content-Type': 'application/pdf' } }),
      { contentType: 'application/pdf', base64: 'JVBERg==' },
    ],
    ['an empty body, as null', new Response(null, { status: 204 }), null],
  ])('returns %s', async (_, response, expected) => {
    fetchMock.mockResolvedValue(response);

    await expect(callOperation({ apiKey: 'k', fetch: fetchMock }, job, { job_id: 'J' })).resolves.toEqual(expected);
  });

  it("throws a ZenrowsError with the operation's own meaning of the status", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'job_not_found', detail: 'No job J.' }, { status: 404 }));

    const error = await callOperation({ apiKey: 'k', fetch: fetchMock }, job, { job_id: 'J' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZenrowsError);
    expect(error).toMatchObject({ status: 404, code: 'job_not_found', detail: 'No job J.' });
    expect((error as ZenrowsError).message).toContain('No such job.');
  });

  it('fails before any call when a path parameter is missing', async () => {
    await expect(callOperation({ apiKey: 'k', fetch: fetchMock }, job, {})).rejects.toThrow('job_id is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
