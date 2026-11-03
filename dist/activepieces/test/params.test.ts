import { describe, expect, it } from 'vitest';
import { HttpError } from '@activepieces/pieces-common';
import { zenrowsClient } from '../src/lib/common/client';
import { zenrowsParams } from '../src/lib/common/params';

const URL = 'https://www.scrapingcourse.com/ecommerce/';

describe('buildScrapeParams', () => {
  it('uses adaptive mode and markdown by default', () => {
    expect(
      zenrowsParams.buildScrapeParams({ url: URL, outputFormat: 'markdown', adaptive: true, forwardHeaders: false })
    ).toEqual({ url: URL, mode: 'auto', response_type: 'markdown' });
  });

  it('ignores manual JS rendering and premium proxy in adaptive mode', () => {
    expect(
      zenrowsParams.buildScrapeParams({
        url: URL,
        outputFormat: 'html',
        adaptive: true,
        jsRender: true,
        premiumProxy: true,
        proxyCountry: 'US',
        forwardHeaders: false,
      })
    ).toEqual({ url: URL, mode: 'auto', proxy_country: 'us' });
  });

  it('sends manual options when adaptive mode is off', () => {
    expect(
      zenrowsParams.buildScrapeParams({
        url: URL,
        outputFormat: 'plaintext',
        adaptive: false,
        jsRender: true,
        premiumProxy: true,
        proxyCountry: 'de',
        waitFor: '.product',
        wait: 500,
        jsInstructions: '[{"click": ".more"}]',
        forwardHeaders: true,
        sessionId: 42,
      })
    ).toEqual({
      url: URL,
      js_render: 'true',
      premium_proxy: 'true',
      proxy_country: 'de',
      wait_for: '.product',
      wait: '500',
      js_instructions: '[{"click":".more"}]',
      custom_headers: 'true',
      session_id: '42',
      response_type: 'plaintext',
    });
  });

  it('forces JS rendering and skips adaptive mode for screenshots', () => {
    expect(
      zenrowsParams.buildScrapeParams({ url: URL, outputFormat: 'screenshot', adaptive: true, forwardHeaders: false })
    ).toEqual({ url: URL, js_render: 'true', screenshot_fullpage: 'true', screenshot_format: 'png' });
  });

  it('rejects browser options without JS rendering in manual mode', () => {
    expect(() =>
      zenrowsParams.buildScrapeParams({
        url: URL,
        outputFormat: 'html',
        adaptive: false,
        waitFor: '.product',
        forwardHeaders: false,
      })
    ).toThrow(/need JS Rendering/);
  });

  it('rejects a proxy country without premium proxy in manual mode', () => {
    expect(() =>
      zenrowsParams.buildScrapeParams({
        url: URL,
        outputFormat: 'html',
        adaptive: false,
        proxyCountry: 'us',
        forwardHeaders: false,
      })
    ).toThrow(/needs Premium Proxy/);
  });

  it('rejects JavaScript instructions that are not a JSON array', () => {
    expect(() =>
      zenrowsParams.buildScrapeParams({
        url: URL,
        outputFormat: 'html',
        adaptive: true,
        jsInstructions: '{"click": ".more"}',
        forwardHeaders: false,
      })
    ).toThrow(/JSON array/);
  });
});

describe('buildExtractParams', () => {
  it('sends CSS selectors as a JSON map', () => {
    expect(
      zenrowsParams.buildExtractParams({
        url: URL,
        method: 'css',
        selectors: { title: 'h1', price: ' .price ', empty: '', count: 3 },
        adaptive: true,
      })
    ).toEqual({ url: URL, mode: 'auto', css_extractor: '{"title":"h1","price":".price"}' });
  });

  it('requires at least one selector', () => {
    expect(() =>
      zenrowsParams.buildExtractParams({ url: URL, method: 'css', selectors: {}, adaptive: false })
    ).toThrow(/at least one field/);
  });

  it('uses automatic extraction with optional fields', () => {
    expect(
      zenrowsParams.buildExtractParams({
        url: URL,
        method: 'auto',
        fields: ['products.name', ' products.price ', '', 7],
        adaptive: false,
      })
    ).toEqual({ url: URL, extract: 'auto', extract_fields: 'products.name,products.price' });
  });
});

describe('toZenrowsError', () => {
  it('turns a ZenRows problem response into a readable error with a hint', () => {
    const error = new HttpError(
      {},
      {
        status: 402,
        responseBody: JSON.stringify({ code: 'AUTH004', title: 'Usage exceeded (AUTH004)', detail: 'No credits left.' }),
      }
    );
    const mapped = zenrowsClient.toZenrowsError({ error });
    expect(mapped).toBeInstanceOf(Error);
    expect(String(mapped)).toContain('ZenRows error AUTH004 (HTTP 402): No credits left.');
    expect(String(mapped)).toContain('credit allowance is spent');
  });

  it.each([
    [{ reason: 'domain_not_prepared' }, 'POST /extract/prepared-domains'],
    [{ title: 'Extract did not recognise this page on example.com' }, 'Preparing the domain again does not change it'],
    [{ title: 'Extract is not enabled for the requested domain' }, 'contact ZenRows support'],
    [{ title: 'Something new' }, 'api-error-codes#REQS007'],
  ])('gives the REQS007 hint for its case (%o)', (fields, hint) => {
    const error = new HttpError({}, { status: 403, responseBody: JSON.stringify({ code: 'REQS007', ...fields }) });
    expect(String(zenrowsClient.toZenrowsError({ error }))).toContain(hint);
  });

  it('keeps errors that are not ZenRows problems unchanged', () => {
    const error = new HttpError({}, { status: 500, responseBody: '<html>oops</html>' });
    expect(zenrowsClient.toZenrowsError({ error })).toBe(error);
    const plain = new Error('network down');
    expect(zenrowsClient.toZenrowsError({ error: plain })).toBe(plain);
  });
});
