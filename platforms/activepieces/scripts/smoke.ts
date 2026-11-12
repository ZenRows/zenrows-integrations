// Run by smoke.sh from inside an activepieces checkout, so bun resolves the
// piece's workspace imports: calls each action's run() with a fake Activepieces
// context against the live API. The key comes in ZENROWS_API_KEY; the checkout
// is argv[2]. Screenshots are written to .cache/smoke/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const checkout = process.argv[2];
const apiKey = process.env['ZENROWS_API_KEY'];
if (!checkout || !apiKey) {
  console.error('usage: ZENROWS_API_KEY=… bun run smoke.ts <activepieces checkout>');
  process.exit(1);
}
const piece = await import(join(checkout, 'packages/pieces/community/zenrows/src/index.ts'));
const actions = piece.zenrows.actions() as Record<string, { run: (ctx: unknown) => Promise<unknown> }>;
const outDir = join(checkout, '..', 'smoke');
mkdirSync(outDir, { recursive: true });

// The parts of an Activepieces action context the piece reads.
function context(name: string, propsValue: Record<string, unknown>, key = apiKey) {
  return {
    auth: { secret_text: key },
    propsValue,
    files: {
      write: async ({ fileName, data }: { fileName: string; data: Buffer }) => {
        const path = join(outDir, fileName);
        writeFileSync(path, data);
        return `file://${path}`;
      },
    },
    store: { get: async () => null, put: async () => null, delete: async () => null },
    server: { apiUrl: 'http://localhost/', publicUrl: 'http://localhost/', token: '' },
    project: { id: 'smoke', externalId: async () => 'smoke' },
    run: { id: 'smoke', name, isTest: true, pauseId: '', stop: () => {}, pause: () => {} },
    connections: { get: async () => null },
    flows: { current: { id: 'smoke', version: { id: 'smoke' } } },
    step: { name },
    generateResumeUrl: () => '',
    tags: { add: async () => {} },
  };
}

const LISTING = 'https://www.scrapingcourse.com/ecommerce/';
const PRODUCT = 'https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/';
// [label, action, form values, expected error code (the case passes only by
// failing with it), API key to use instead of the real one]
const cases: [string, string, Record<string, unknown>, string?, string?][] = [
  ['scrape_url markdown', 'scrape_url', { url: LISTING, output_format: 'markdown', adaptive: true }],
  ['scrape_url screenshot', 'scrape_url', { url: LISTING, output_format: 'screenshot', adaptive: true }],
  ['scrape_url html of a JSON page, with headers and JS', 'scrape_url', { url: 'https://httpbin.io/headers', output_format: 'html', adaptive: true, custom_headers: { Referer: 'https://example.com' }, js_instructions: '[{"wait": 500}]' }],
  ['extract css', 'extract_structured_data', { url: LISTING, method: 'css', selectors: { title: 'h1', products: '.product-name' }, adaptive: true }],
  ['extract auto, listing page', 'extract_structured_data', { url: LISTING, method: 'auto', adaptive: true }],
  ['extract auto, product page', 'extract_structured_data', { url: PRODUCT, method: 'auto', adaptive: true }],
  ['get_account_usage', 'get_account_usage', {}],
  // The Custom API Call's url prop is a dynamic property: { url: <value> }.
  ['custom_api_call', 'custom_api_call', { url: { url: '/subscriptions/self/details' }, method: 'GET', headers: {}, queryParams: {}, failsafe: false }],
  // These pass only if the API rejects them with this code, and the message
  // carries the API's reason plus our hint.
  ['wrong key', 'get_account_usage', {}, 'AUTH002', 'not-a-key'],
  ['protected page, adaptive off', 'scrape_url', { url: 'https://www.scrapingcourse.com/cloudflare-challenge', output_format: 'html', adaptive: false }, 'REQS002'],
];

let failed = 0;
for (const [label, name, props, expectError, key] of cases) {
  const started = Date.now();
  const ms = () => `${Date.now() - started} ms`;
  try {
    const result = await actions[name].run(context(name, props, key));
    const text = JSON.stringify(result);
    if (expectError) {
      failed++;
      console.log(`❌ ${label} (${ms()}): expected a ${expectError} error, got ${text.slice(0, 120)}`);
    } else {
      console.log(`✅ ${label} (${ms()}): ${text.length > 240 ? `${text.slice(0, 240)}… [${text.length} chars]` : text}`);
    }
  } catch (e) {
    const message = (e as Error).message;
    if (expectError && message.includes(expectError)) {
      console.log(`✅ ${label} (${ms()}): rejected with ${expectError}, as intended: ${message}`);
    } else {
      failed++;
      console.log(`❌ ${label} (${ms()}): ${message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
