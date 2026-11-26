import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createZenrowsScrapeTool } from '../scrape.js';

const fetchMock = vi.fn<typeof fetch>();
const sentParams = () => Object.fromEntries(new URL(String(fetchMock.mock.calls[0]![0])).searchParams);
const scrape = (input: Record<string, unknown>) =>
  createZenrowsScrapeTool({ apiKey: 'k', fetch: fetchMock }).execute!(input as never, {} as never);

describe('createZenrowsScrapeTool', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('# Example Domain', { headers: { 'X-Request-Credits': '1' } }));
  });

  it('is the zenrows-scrape tool', () => {
    const tool = createZenrowsScrapeTool();
    expect(tool.id).toBe('zenrows-scrape');
    expect(tool.description).toContain('zenrows-extract');
  });

  it('asks for Markdown when no response_type is given', async () => {
    await scrape({ url: 'https://example.com/' });

    expect(sentParams()).toEqual({ url: 'https://example.com/', response_type: 'markdown' });
  });

  it('sends no response_type for html, which is how the API returns the HTML', async () => {
    await scrape({ url: 'https://example.com/', response_type: 'html' });

    expect(sentParams()).toEqual({ url: 'https://example.com/' });
  });

  it('passes plaintext and the fetch options through', async () => {
    await scrape({ url: 'https://example.com/', response_type: 'plaintext', js_render: true, wait_for: '#main' });

    expect(sentParams()).toEqual({
      url: 'https://example.com/',
      response_type: 'plaintext',
      js_render: 'true',
      wait_for: '#main',
    });
  });

  it('returns the page and the credits it used', async () => {
    await expect(scrape({ url: 'https://example.com/' })).resolves.toEqual({
      url: 'https://example.com/',
      content: '# Example Domain',
      credits: 1,
    });
  });

  it('returns the css_extractor fields as JSON text', async () => {
    fetchMock.mockResolvedValue(Response.json({ title: 'Example Domain' }));

    const result = await scrape({ url: 'https://example.com/', css_extractor: '{"title":"h1"}' });

    expect(sentParams().css_extractor).toBe('{"title":"h1"}');
    expect(result).toMatchObject({ content: '{"title":"Example Domain"}', credits: null });
  });
});
