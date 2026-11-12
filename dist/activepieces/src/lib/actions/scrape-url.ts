import { randomUUID } from 'crypto';
import { createAction, OutputSchema, Property } from '@activepieces/pieces-framework';
import { zenrowsAuth } from '../auth';
import { zenrowsClient } from '../common/client';

type OutputFormat = 'markdown' | 'html' | 'plaintext' | 'screenshot';

// What each format adds to the request. A screenshot needs a real browser, so
// it sets js_render itself instead of leaving the choice to Adaptive Stealth Mode.
const FORMAT_PARAMS: Record<OutputFormat, Record<string, string>> = {
  markdown: { response_type: 'markdown' },
  html: {},
  plaintext: { response_type: 'plaintext' },
  screenshot: { js_render: 'true', screenshot_fullpage: 'true', screenshot_format: 'png' },
};

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
    output_format: Property.StaticDropdown<OutputFormat>({
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
        'Recommended. ZenRows starts with the cheapest setup and adds JS rendering or premium proxies only when the page needs them; you pay only for what succeeds. Turn off for a basic request, or use the Custom API Call action to set each option yourself.',
      required: false,
      defaultValue: true,
    }),
    js_instructions: Property.LongText({
      displayName: 'JavaScript Instructions',
      description:
        'Actions to run on the page before it is returned, as a JSON array, e.g. [{"click": ".load-more"}, {"wait": 1000}]. See https://docs.zenrows.com for the full list.',
      required: false,
    }),
    custom_headers: Property.Object({
      displayName: 'Custom Headers',
      description: 'Headers to send to the target site, such as Cookie or Referer.',
      required: false,
    }),
  },
  async run(context) {
    const { propsValue } = context;
    const outputFormat = propsValue.output_format ?? 'markdown';
    const isScreenshot = outputFormat === 'screenshot';
    const forwardedHeaders = stringValues(propsValue.custom_headers);
    const forwardHeaders = Object.keys(forwardedHeaders).length > 0;
    const jsInstructions = propsValue.js_instructions?.trim();

    const response = await zenrowsClient.fetchPage({
      apiKey: context.auth.secret_text,
      params: {
        url: propsValue.url,
        ...(propsValue.adaptive !== false && !isScreenshot ? { mode: 'auto' } : {}),
        ...FORMAT_PARAMS[outputFormat],
        ...(jsInstructions ? { js_instructions: jsInstructions } : {}),
        ...(forwardHeaders ? { custom_headers: 'true' } : {}),
      },
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

// The headers the form holds as text, trimmed; other values are left out.
function stringValues(value: Record<string, unknown> | null | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).flatMap(([key, entry]) =>
      typeof entry === 'string' && entry.trim() && key.trim() ? [[key.trim(), entry.trim()]] : []
    )
  );
}

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
