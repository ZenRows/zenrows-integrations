// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"POST","server":"https://api.zenrows.com/v1","path":"/crawls","key":"header","responses":{"202":"The crawl started.","400":"`invalid_request` (the body is not valid JSON, or the `Idempotency-Key` is over 255 characters), `unknown_parameter` (`detail` names it) or `invalid_parameter`. Documented at https://docs.zenrows.com/crawl/endpoints#errors.","401":"The API key is missing or invalid.","402":"The account is out of credits, or the plan does not include this capability.","409":"`idempotency_request_in_flight`: a request with this `Idempotency-Key` is still in progress. Retry when it ends.","422":"`invalid_start_url` (the host is an IP address or a private address, or the URL is over 2,048 characters), `invalid_parameter` or `idempotency_key_reused`.","429":"`too_many_crawls`: the account already runs its active jobs (3 by default, shared with Batch). Wait for one to end; the response carries `Retry-After: 30`.","500":"`internal_error`: something failed on our side. Retry later."},"body":["url","depth","max_items","max_pages","include_patterns","exclude_patterns","output_format"]};

export const zenrowsStartCrawlInputSchema = z.object({
  url: z.string().url().max(2048).describe('The start URL: a public `http` or `https` URL. The crawl starts on this exact URL and stays on its domain, subdomains included.'),
  depth: z.number().int().min(1).max(100000).optional().describe('How many link steps to follow from the start URL. At `1`, the links on the start page. Omit it to follow links until `max_items` or `max_pages` stops the crawl.'),
  max_items: z.number().int().min(1).max(100000).optional().describe('Stop after keeping this many URLs.'),
  max_pages: z.number().int().min(1).max(100000).optional().describe('Stop after fetching this many pages. Caps what the crawl costs. If both limits are reached together, `stop_reason` is `max_pages`.'),
  include_patterns: z.array(z.string()).optional().describe('Keep, and follow, only URLs that contain one of these texts, such as /product/.'),
  exclude_patterns: z.array(z.string()).optional().describe('Drop URLs that contain any of these texts, even when they match an include pattern.'),
  output_format: z.literal('html').optional().describe('HTML also fetches and keeps the HTML of each page found. Leave it empty to get URLs only.'),
});

export function createZenrowsStartCrawlTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-start-crawl',
    description: 'Starts a crawl from one URL that follows links on the same domain and returns its crawl_id at once. Use it to discover the URLs of a site or section; use zenrows-create-batch-job when you already have the URLs. Read results with zenrows-get-crawl or zenrows-download-crawl. Each call starts a new crawl, so a retry duplicates the work. A job is billed after it runs, by the credits each page or task it fetches uses: 1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan.',
    inputSchema: zenrowsStartCrawlInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
