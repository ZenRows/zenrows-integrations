import { randomUUID } from 'crypto';
import { createAction, OutputSchema, Property } from '@activepieces/pieces-framework';
import { zenrowsAuth } from '../auth';
import { zenrowsClient } from '../common/client';
import { ScrapeOutputFormat, zenrowsParams } from '../common/params';

export const scrapeUrlAction = createAction({
  auth: zenrowsAuth,
  name: 'scrape_url',
  classification: 'READ',
  displayName: 'Scrape URL',
  description:
    'Get the content of any web page as Markdown, HTML, plain text or a screenshot, bypassing anti-bot protection.',
  audience: 'both',
  outputSchema: scrapeOutputSchema(),
  aiMetadata: {
    description:
      'Fetches one web page through ZenRows and returns its content as Markdown, HTML, plain text or a full-page screenshot, getting past CAPTCHAs and anti-bot systems. Pick this when you have the exact URL and need the page content; use Extract Structured Data when you need specific fields as JSON. Read-only against the target, so retries are safe, but each call spends ZenRows credits.',
    idempotent: true,
  },
  props: {
    url: Property.ShortText({
      displayName: 'URL',
      description: 'The full address of the page to scrape, e.g. https://www.scrapingcourse.com/ecommerce/',
      required: true,
    }),
    output_format: Property.StaticDropdown<ScrapeOutputFormat>({
      displayName: 'Output Format',
      description: 'Markdown is the easiest format to read or pass to an AI step. Screenshots always use JS rendering.',
      required: true,
      defaultValue: 'markdown',
      options: {
        disabled: false,
        options: [
          { label: 'Markdown', value: 'markdown' },
          { label: 'HTML', value: 'html' },
          { label: 'Plain Text', value: 'plaintext' },
          { label: 'Screenshot (PNG)', value: 'screenshot' },
        ],
      },
    }),
    adaptive: Property.Checkbox({
      displayName: 'Adaptive Stealth Mode',
      description:
        'Recommended. ZenRows starts with the cheapest setup and adds JS rendering or premium proxies only when the page needs them; you pay only for what succeeds. Turn off to choose JS Rendering and Premium Proxy yourself.',
      required: false,
      defaultValue: true,
    }),
    js_render: Property.Checkbox({
      displayName: 'JS Rendering',
      description:
        'Load the page in a real browser so content added by JavaScript is included. Only used when Adaptive Stealth Mode is off.',
      required: false,
      defaultValue: false,
    }),
    premium_proxy: Property.Checkbox({
      displayName: 'Premium Proxy',
      description:
        'Route the request through residential IPs, needed by most protected sites. Only used when Adaptive Stealth Mode is off.',
      required: false,
      defaultValue: false,
    }),
    proxy_country: Property.ShortText({
      displayName: 'Proxy Country',
      description:
        'Two-letter country code to scrape from, e.g. us, gb or de. Needs Premium Proxy when Adaptive Stealth Mode is off.',
      required: false,
    }),
    wait_for: Property.ShortText({
      displayName: 'Wait For Selector',
      description: 'A CSS selector to wait for before returning the page, e.g. .product-list. Needs JS rendering.',
      required: false,
    }),
    wait: Property.Number({
      displayName: 'Wait (ms)',
      description: 'Extra milliseconds to wait after the page loads. Needs JS rendering.',
      required: false,
    }),
    js_instructions: Property.LongText({
      displayName: 'JavaScript Instructions',
      description:
        'Actions to run on the page before it is returned, as a JSON array, e.g. [{"click": ".load-more"}, {"wait": 1000}]. Needs JS rendering. See https://docs.zenrows.com for the full list.',
      required: false,
    }),
    custom_headers: Property.Object({
      displayName: 'Custom Headers',
      description: 'Headers to send to the target site, such as Cookie or Referer.',
      required: false,
    }),
    session_id: Property.Number({
      displayName: 'Session ID',
      description: 'Any number you choose. Requests with the same Session ID use the same IP for up to 10 minutes.',
      required: false,
    }),
  },
  async run(context) {
    const { propsValue } = context;
    const outputFormat = propsValue.output_format ?? 'markdown';
    const forwardedHeaders = zenrowsParams.toStringRecord({ value: propsValue.custom_headers });
    const forwardHeaders = Object.keys(forwardedHeaders).length > 0;
    const isScreenshot = outputFormat === 'screenshot';

    const params = zenrowsParams.buildScrapeParams({
      url: propsValue.url,
      outputFormat,
      adaptive: propsValue.adaptive ?? true,
      jsRender: propsValue.js_render,
      premiumProxy: propsValue.premium_proxy,
      proxyCountry: propsValue.proxy_country,
      waitFor: propsValue.wait_for,
      wait: propsValue.wait,
      jsInstructions: propsValue.js_instructions,
      forwardHeaders,
      sessionId: propsValue.session_id,
    });

    const response = await zenrowsClient.fetchPage({
      apiKey: context.auth.secret_text,
      params,
      forwardedHeaders: forwardHeaders ? forwardedHeaders : undefined,
      binary: isScreenshot,
    });

    const screenshotUrl = isScreenshot
      ? await context.files.write({
          fileName: `zenrows-screenshot-${randomUUID()}.png`,
          data: Buffer.from(response.body),
        })
      : null;

    const requestCost = zenrowsClient.readHeader({ headers: response.headers, name: 'X-Request-Cost' });

    return {
      url: propsValue.url,
      output_format: outputFormat,
      content: isScreenshot ? null : String(response.body),
      screenshot_url: screenshotUrl,
      final_url: zenrowsClient.readHeader({ headers: response.headers, name: 'Zr-Final-Url' }),
      request_cost: requestCost === null ? null : Number(requestCost),
      request_id: zenrowsClient.readHeader({ headers: response.headers, name: 'X-Request-Id' }),
    };
  },
});

function scrapeOutputSchema(): OutputSchema {
  return {
    fields: [
      { key: 'url', label: 'URL', format: 'url' },
      { key: 'output_format', label: 'Output Format' },
      { key: 'content', label: 'Content' },
      { key: 'screenshot_url', label: 'Screenshot', format: 'image' },
      { key: 'final_url', label: 'Final URL', format: 'url' },
      { key: 'request_cost', label: 'Request Cost', format: 'number' },
      { key: 'request_id', label: 'Request ID' },
    ],
  };
}
