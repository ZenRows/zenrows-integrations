import { describe, expect, it, vi } from 'vitest';

import { createZenrowsTools } from '../tools.js';

describe('createZenrowsTools', () => {
  it('returns both tools, sharing the options', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
    const { zenrowsScrape, zenrowsExtract } = createZenrowsTools({ apiKey: 'shared-key', fetch: fetchMock });

    expect(zenrowsScrape.id).toBe('zenrows-scrape');
    expect(zenrowsExtract.id).toBe('zenrows-extract');

    await zenrowsScrape.execute!({ url: 'https://example.com/' } as never, {} as never);
    await zenrowsExtract.execute!({ url: 'https://example.com/' } as never, {} as never);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init!.headers).get('X-API-Key')).toBe('shared-key');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
