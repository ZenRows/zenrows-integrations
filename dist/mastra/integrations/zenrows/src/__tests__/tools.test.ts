import { describe, expect, it, vi } from 'vitest';

import { createZenrowsGeneratedTools } from '../generated/index.js';
import { createZenrowsAllTools, createZenrowsTools } from '../tools.js';

describe('createZenrowsAllTools', () => {
  it('returns scrape, extract and every generated tool', () => {
    const generated = createZenrowsGeneratedTools();
    expect(Object.keys(createZenrowsAllTools())).toEqual([
      'zenrowsScrape',
      'zenrowsExtract',
      ...Object.keys(generated),
    ]);
  });
});

describe('createZenrowsTools', () => {
  it('returns scrape and extract only, sharing the options', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
    const tools = createZenrowsTools({ apiKey: 'shared-key', fetch: fetchMock });

    expect(Object.keys(tools)).toEqual(['zenrowsScrape', 'zenrowsExtract']);
    expect(tools.zenrowsScrape.id).toBe('zenrows-scrape');
    expect(tools.zenrowsExtract.id).toBe('zenrows-extract');

    await tools.zenrowsScrape.execute!({ url: 'https://example.com/' } as never, {} as never);
    await tools.zenrowsExtract.execute!({ url: 'https://example.com/' } as never, {} as never);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init!.headers).get('X-API-Key')).toBe('shared-key');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('the generated tools', () => {
  const tools = Object.values(createZenrowsGeneratedTools());

  it('cover batch jobs, crawls and Extract domains', () => {
    const ids = tools.map(tool => tool.id);
    expect(ids).toEqual(
      expect.arrayContaining(['zenrows-create-batch-job', 'zenrows-start-crawl', 'zenrows-request-extract-domain']),
    );
  });

  it.each(tools.map(tool => [tool.id, tool] as const))(
    '%s has an id, a description and an input schema',
    (id, tool) => {
      expect(id).toMatch(/^zenrows-[a-z0-9-]+$/);
      expect(tool.description).toMatch(/credits/);
      expect(tool.inputSchema).toBeDefined();
    },
  );

  it.each(tools.map(tool => [tool.id, tool] as const))('%s sends one request with the key', async (_, tool) => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
    const [own] = Object.values(createZenrowsGeneratedTools({ apiKey: 'k', fetch: fetchMock })).filter(
      t => t.id === tool.id,
    );
    // Every required input of every tool, so each one validates and its path fills.
    const input = {
      job_id: '01JABCDEFGHJKMNPQRSTVWXYZ0',
      task_id: 'T',
      crawl_id: 'C',
      content_id: 'P',
      domain: 'example.com',
      url: 'https://example.com/',
    };

    await own!.execute!(input as never, {} as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    const key = new Headers(init!.headers).get('X-API-Key') ?? new URL(String(url)).searchParams.get('apikey');
    expect(key).toBe('k');
    expect(String(url)).not.toMatch(/[{}]/);
  });
});
