// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://api.zenrows.com/v1","path":"/crawls/{crawl_id}/download","key":"header","responses":{"200":"The results as NDJSON.","400":"`unknown_parameter`: the request has a query parameter this endpoint does not accept; `detail` names it. Documented at https://docs.zenrows.com/crawl/endpoints#errors.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","404":"`crawl_not_found`: no crawl with this ID exists on your account.","429":"`too_many_crawls`: the account already runs its active jobs (3 by default, shared with Batch). Wait for one to end; the response carries `Retry-After: 30`.","500":"`internal_error`: something failed on our side. Retry later."}};

export const zenrowsDownloadCrawlInputSchema = z.object({
  crawl_id: z.string().describe("The crawl's ID, as returned when it started."),
});

export function createZenrowsDownloadCrawlTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-download-crawl',
    description: 'Download all results. Every result as one NDJSON file named `{crawl_id}.jsonl`, one JSON object per line. Each line has the `url`; with `output_format`, also `content_status` and, once fetched, the page HTML in `content`. While the crawl runs, a later download may hold more lines. Documented at https://docs.zenrows.com/crawl/endpoints#download-the-results. This call uses no credits.',
    inputSchema: zenrowsDownloadCrawlInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
