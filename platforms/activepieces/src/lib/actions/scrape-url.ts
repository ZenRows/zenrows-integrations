import { randomUUID } from 'crypto';
import { createAction, OutputSchema, Property } from '@activepieces/pieces-framework';
import { zenrowsAuth } from '../auth';
import { FETCH_PARAMS, FetchParams, FetchValue, zenrowsClient } from '../common/client';

type OutputFormat = 'markdown' | 'html' | 'plaintext' | 'screenshot';

// What each format adds to the request. A screenshot needs a real browser, so
// it sets js_render itself instead of leaving the choice to Adaptive Stealth Mode.
const FORMAT_PARAMS: Record<OutputFormat, FetchParams> = {
  markdown: { response_type: 'markdown' satisfies FetchValue<'response_type'> },
  html: {},
  plaintext: { response_type: 'plaintext' satisfies FetchValue<'response_type'> },
  screenshot: { js_render: 'true', screenshot: 'true', screenshot_fullpage: 'true', screenshot_format: 'png' satisfies FetchValue<'screenshot_format'> },
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
      'Fetches one web page through Zenrows and returns its content as Markdown, HTML, plain text or a full-page screenshot, getting past CAPTCHAs and anti-bot systems. Pick this when you have the exact URL and need the page content; use Extract Structured Data From A Page when you need specific fields as JSON. Read-only against the target, so retries are safe, but each call spends Zenrows credits: {{< credit-weights}}; {{< failed-not-billed}}.',
    idempotent: true,
  },
  props: {
    url: Property.ShortText({
      displayName: 'URL',
      description: FETCH_PARAMS.properties.url.description,
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
      description: {{text:adaptive-stealth-mode}} + '.',
      required: false,
      defaultValue: true,
    }),
    js_instructions: Property.LongText({
      displayName: 'JavaScript Instructions',
      description: FETCH_PARAMS.properties.js_instructions.description,
      required: false,
    }),
    custom_headers: Property.Object({
      displayName: 'Custom Headers',
      description: FETCH_PARAMS.properties.custom_headers.description,
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
      responseType: isScreenshot ? 'arraybuffer' : 'text',
    });

    const screenshotUrl = isScreenshot
      ? await context.files.write({
          fileName: `zenrows-screenshot-${randomUUID()}.png`,
          data: pngOrThrow(Buffer.from(response.body)),
        })
      : null;

    const requestCost = zenrowsClient.readHeader({ headers: response.headers, name: 'X-Request-Cost' });
    const requestCredits = zenrowsClient.readHeader({ headers: response.headers, name: 'X-Request-Credits' });

    return {
      url: propsValue.url,
      output_format: outputFormat,
      content: isScreenshot ? null : String(response.body),
      screenshot_url: screenshotUrl,
      final_url: zenrowsClient.readHeader({ headers: response.headers, name: 'Zr-Final-Url' }),
      request_credits: requestCredits === null ? null : Number(requestCredits),
      request_cost: requestCost === null ? null : Number(requestCost),
      request_id: zenrowsClient.readHeader({ headers: response.headers, name: 'X-Request-Id' }),
    };
  },
});

// The API labels a screenshot text/plain, so the bytes decide: a body that is
// not a PNG (a page sent back instead of the image) fails the step rather than
// being saved as a broken .png.
function pngOrThrow(data: Buffer): Buffer {
  if (data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return data;
  }
  throw new Error(
    `Zenrows answered the screenshot request without an image (${data.length} bytes starting "${data.subarray(0, 40).toString('utf8')}").`
  );
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
      { key: 'request_credits', label: 'Credits Used', format: 'number' },
      { key: 'request_cost', label: 'Request Cost (USD)', format: 'number' },
      { key: 'request_id', label: 'Request ID' },
    ],
  };
}
