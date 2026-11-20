import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createZenrowsExtractTool } from '../extract.js';

const fetchMock = vi.fn<typeof fetch>();
const sentParams = () => Object.fromEntries(new URL(String(fetchMock.mock.calls[0]![0])).searchParams);
const extract = (input: Record<string, unknown>) =>
  createZenrowsExtractTool({ apiKey: 'k', fetch: fetchMock }).execute!(input as never, {} as never);

describe('createZenrowsExtractTool', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      Response.json({ products: [{ name: 'Mug', price: '9.00' }] }, { headers: { 'X-Request-Credits': '1' } }),
    );
  });

  it('is the zenrows-extract tool', () => {
    const tool = createZenrowsExtractTool();
    expect(tool.id).toBe('zenrows-extract');
    expect(tool.description).toContain('zenrows-scrape');
  });

  it('pins extract=auto and passes the fields and fetch options', async () => {
    await extract({ url: 'https://shop.example/mug', extract_fields: 'products.name', premium_proxy: true });

    expect(sentParams()).toEqual({
      url: 'https://shop.example/mug',
      extract_fields: 'products.name',
      premium_proxy: 'true',
      extract: 'auto',
    });
  });

  it('returns the fields parsed from JSON and the credits', async () => {
    await expect(extract({ url: 'https://shop.example/mug' })).resolves.toEqual({
      url: 'https://shop.example/mug',
      data: { products: [{ name: 'Mug', price: '9.00' }] },
      credits: 1,
    });
  });
});
