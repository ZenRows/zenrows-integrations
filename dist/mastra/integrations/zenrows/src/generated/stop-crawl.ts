// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"POST","server":"https://api.zenrows.com/v1","path":"/crawls/{crawl_id}/stop","key":"header","responses":{"200":"The crawl, stopped.","400":"`unknown_parameter`: the request has a query parameter this endpoint does not accept; `detail` names it. Documented at https://docs.zenrows.com/crawl/endpoints#errors.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","404":"`crawl_not_found`: no crawl with this ID exists on your account.","429":"`too_many_crawls`: the account already runs its active jobs (3 by default, shared with Batch). Wait for one to end; the response carries `Retry-After: 30`.","500":"`internal_error`: something failed on our side. Retry later."}};

export const zenrowsStopCrawlInputSchema = z.object({
  crawl_id: z.string().describe("The crawl's ID, as returned when it started."),
});

export function createZenrowsStopCrawlTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-stop-crawl',
    description: 'Stop a crawl. Stop a running crawl. No new page is fetched; pages already being fetched finish, are billed and are kept for up to 10 minutes. Read the crawl until `next_cursor` is `null` for its final results. A crawl that already ended returns its final state. Send no body. Documented at https://docs.zenrows.com/crawl/endpoints#stop-a-crawl. This call uses no credits.',
    inputSchema: zenrowsStopCrawlInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
