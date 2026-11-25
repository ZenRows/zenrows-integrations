import { describe, expect, it } from 'vitest';

import { ZenrowsError } from '../client.js';
import { createZenrowsAllTools } from '../tools.js';

// Calls the real API, so it runs only with ZENROWS_API_KEY set. ZENROWS_API_URL
// points it at another deployment.
describe.skipIf(!process.env.ZENROWS_API_KEY)('Zenrows, live', () => {
  const tools = createZenrowsAllTools();
  const { zenrowsScrape, zenrowsExtract } = tools;
  const run = async (tool: { execute?: (input: never, context: never) => Promise<unknown> }, input: object) =>
    (await tool.execute!(input as never, {} as never)) as Record<string, unknown>;
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it('scrapes a page as Markdown', { timeout: 200_000 }, async () => {
    const result = await zenrowsScrape.execute!({ url: 'https://example.com/' } as never, {} as never);
    console.info('live scrape', {
      bytes: (result as { content: string }).content.length,
      credits: (result as { credits: unknown }).credits,
    });

    expect(result).toMatchObject({ url: 'https://example.com/', content: expect.stringMatching(/example/i) });
    expect((result as { credits: unknown }).credits).toEqual(expect.any(Number));
  });

  // A product page on the domain the spec's own examples prepare for Extract.
  const product = 'https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/';

  it('extracts a page, or answers with an API error code', { timeout: 200_000 }, async () => {
    const outcome = await zenrowsExtract.execute!({ url: product } as never, {} as never).then(
      result => ({ result }),
      (error: unknown) => ({ error }),
    );
    console.info('live extract', 'error' in outcome ? String(outcome.error) : JSON.stringify(outcome.result));

    if ('error' in outcome) {
      expect(outcome.error).toBeInstanceOf(ZenrowsError);
      expect((outcome.error as ZenrowsError).code).toMatch(/^[A-Za-z0-9_]+$/);
    } else {
      expect(outcome.result).toMatchObject({ url: product, data: expect.anything() });
    }
  });

  it('runs a two-URL batch job through to its results', { timeout: 300_000 }, async () => {
    const job = await run(tools.zenrowsCreateBatchJob, {
      name: 'mastra live test',
      tasks: [{ url: 'https://example.com/' }, { url: 'https://www.scrapingcourse.com/ecommerce/' }],
    });
    const jobId = String(job.id ?? job.job_id);
    console.info('live batch job', jobId, JSON.stringify(job).slice(0, 300));
    expect(jobId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    let latest: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      latest = ((await run(tools.zenrowsGetBatchJob, { job_id: jobId })).latest_run ?? {}) as Record<string, unknown>;
      if (!['pending', 'queued', 'running', 'processing', 'created'].includes(String(latest.status))) break;
      await pause(5_000);
    }
    console.info('live batch run', JSON.stringify(latest).slice(0, 500));

    const results = await run(tools.zenrowsGetBatchResults, { job_id: jobId });
    console.info('live batch results', JSON.stringify(results).slice(0, 500));
    expect(results).toBeTypeOf('object');
  });

  it('runs a two-page crawl, stops it and downloads what it kept', { timeout: 300_000 }, async () => {
    const crawl = await run(tools.zenrowsStartCrawl, {
      url: 'https://www.scrapingcourse.com/ecommerce/',
      max_pages: 2,
      max_items: 2,
    });
    const crawlId = String(crawl.id ?? crawl.crawl_id);
    console.info('live crawl', crawlId, JSON.stringify(crawl).slice(0, 300));
    expect(crawlId).toBeTruthy();

    let read: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      read = await run(tools.zenrowsGetCrawl, { crawl_id: crawlId });
      if (read.next_cursor === null) break;
      await pause(5_000);
    }
    const stopped = await run(tools.zenrowsStopCrawl, { crawl_id: crawlId });
    console.info('live crawl read', JSON.stringify(read).slice(0, 500), 'stop', JSON.stringify(stopped).slice(0, 200));

    const download = (await tools.zenrowsDownloadCrawl.execute!(
      { crawl_id: crawlId } as never,
      {} as never,
    )) as unknown;
    console.info('live crawl download', String(download).slice(0, 300));
    expect(typeof download === 'string' || download === null).toBe(true);
  });
});
