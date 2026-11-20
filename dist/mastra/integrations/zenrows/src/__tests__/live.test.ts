import { describe, expect, it } from 'vitest';

import { ZenrowsError } from '../client.js';
import { createZenrowsTools } from '../tools.js';

// Calls the real API, so it runs only with ZENROWS_API_KEY set. ZENROWS_API_URL
// points it at another deployment.
describe.skipIf(!process.env.ZENROWS_API_KEY)('ZenRows, live', () => {
  const { zenrowsScrape, zenrowsExtract } = createZenrowsTools();

  it('scrapes a page as Markdown', { timeout: 200_000 }, async () => {
    const result = await zenrowsScrape.execute!({ url: 'https://example.com/' } as never, {} as never);
    console.info('live scrape', {
      bytes: (result as { content: string }).content.length,
      credits: (result as { credits: unknown }).credits,
    });

    expect(result).toMatchObject({ url: 'https://example.com/', content: expect.stringMatching(/example/i) });
    expect((result as { credits: unknown }).credits).toEqual(expect.any(Number));
  });

  it('extracts a page, or answers with an API error code', { timeout: 200_000 }, async () => {
    const outcome = await zenrowsExtract.execute!({ url: 'https://example.com/' } as never, {} as never).then(
      result => ({ result }),
      (error: unknown) => ({ error }),
    );
    console.info('live extract', 'error' in outcome ? String(outcome.error) : JSON.stringify(outcome.result));

    if ('error' in outcome) {
      expect(outcome.error).toBeInstanceOf(ZenrowsError);
      expect((outcome.error as ZenrowsError).code).toMatch(/^[A-Za-z0-9_]+$/);
    } else {
      expect(outcome.result).toMatchObject({ url: 'https://example.com/', data: expect.anything() });
    }
  });
});
