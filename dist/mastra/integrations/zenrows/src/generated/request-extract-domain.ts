// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"POST","server":"https://api.zenrows.com/v1","path":"/extract/prepared-domains","key":"header","responses":{"202":"Accepted. The body is the submission in the same shape `getExtractDomainStatus` returns.","400":"`invalid_argument`: the body is missing or malformed. `reason` carries a machine-readable tag such as `invalid_domain`.","401":"The API key is missing or invalid.","409":"`in_progress`: the domain already has a preparation running, so poll its status. Or `idempotency_conflict`: the same `Idempotency-Key` was reused with a different body.","429":"`out_of_allowance`: no preparation slots left this month. See `getExtractAllowance`."},"body":["domain","example_urls"]};

export const zenrowsRequestExtractDomainInputSchema = z.object({
  domain: z.string().describe('The domain to prepare, without scheme.'),
  example_urls: z.array(z.string().url()).optional().describe('1 to 5 URLs on that domain. One works; at least 3 pages of your main page type work better, and other types can share the rest of the 5. When present, they replace discovery.'),
});

export function createZenrowsRequestExtractDomainTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-request-extract-domain',
    description: 'Ask for a domain to be prepared for Extract. Submit a domain for preparation, within a monthly allowance. The submission is accepted immediately and works through discovery, preparation and verification, typically in minutes: poll `getExtractDomainStatus` instead of blocking. Send `example_urls` when you can; they replace discovery. One URL works, but up to 5 related URLs work better: Extract compares the pages of one type against each other, so it can check the fields it found and fill in fields one page is missing. Send at least 3 pages of your main page type; other types can share the rest of the 5 (for example 3 product pages and 2 search result pages). Submitting a domain that is already prepared returns its current record rather than starting again, so it does not add new kinds of page. Send an `Idempotency-Key` header to make a retry safe. Costs no credits. Documented at https://docs.zenrows.com/extract/endpoints. This call uses no credits.',
    inputSchema: zenrowsRequestExtractDomainInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
