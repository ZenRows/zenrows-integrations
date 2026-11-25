// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://api.zenrows.com/v1","path":"/crawls/{crawl_id}","key":"header","responses":{"200":"The crawl and a page of its results.","400":"`invalid_cursor` (the cursor belongs to another crawl) or `invalid_request` (`limit` is not valid). Documented at https://docs.zenrows.com/crawl/endpoints#errors.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","404":"`crawl_not_found`: no crawl with this ID exists on your account.","429":"`too_many_crawls`: the account already runs its active jobs (3 by default, shared with Batch). Wait for one to end; the response carries `Retry-After: 30`.","500":"`internal_error`: something failed on our side. Retry later."},"query":["cursor","limit"]};

export const zenrowsGetCrawlInputSchema = z.object({
  cursor: z.string().optional().describe('The `next_cursor` from the previous read. Omit it to start from the first result.'),
  limit: z.number().int().min(1).max(10000).optional().describe('How many results to return.'),
  crawl_id: z.string().describe("The crawl's ID, as zenrows-start-crawl returned it (crawl_id)."),
});

export function createZenrowsGetCrawlTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-crawl',
    description: "Reads a crawl's status, coverage and one page of results. While it runs, pass next_cursor back as cursor to get only new URLs; it is null once the crawl has ended and everything is read. Safe to retry. This call uses no credits.",
    inputSchema: zenrowsGetCrawlInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
