// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://api.zenrows.com/v1","path":"/crawls/{crawl_id}/contents/{content_id}","key":"header","responses":{"200":"The page's HTML.","400":"`unknown_parameter`: the request has a query parameter this endpoint does not accept; `detail` names it. Documented at https://docs.zenrows.com/crawl/endpoints#errors.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","404":"`crawl_not_found`, or `content_not_found`: the page is not fetched yet, its fetch failed, or the crawl has no `output_format`.","429":"`too_many_crawls`: the account already runs its active jobs (3 by default, shared with Batch). Wait for one to end; the response carries `Retry-After: 30`.","500":"`internal_error`: something failed on our side. Retry later."},"query":["download"]};

export const zenrowsGetCrawlContentInputSchema = z.object({
  download: z.boolean().optional().describe('`true` returns the page as a file to save.'),
  crawl_id: z.string().describe("The crawl's ID, as Start Crawl returned it (crawl_id)."),
  content_id: z.string().describe("From the result's `content_url`."),
});

export function createZenrowsGetCrawlContentTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-crawl-content',
    description: "Returns the HTML of one page a crawl with an output format fetched. Take Content ID from the result's content_url. Costs no credits; safe to retry.",
    inputSchema: zenrowsGetCrawlContentInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
