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
  example_urls: z.array(z.string().url()).optional().describe('1 to 5 page URLs on the domain. At least 3 pages of your main page type (for example product pages) work best; other page types can fill the rest.'),
});

export function createZenrowsRequestExtractDomainTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-request-extract-domain',
    description: 'Submits a domain for Extract to prepare, within a monthly allowance, and returns at once. Use it after zenrows-extract answers REQS007, then poll zenrows-get-extract-domain-status until status is ready. Send 3 to 5 example URLs of the main page type when you can. Submitting a prepared domain returns its current state, so a retry is safe. This call uses no credits.',
    inputSchema: zenrowsRequestExtractDomainInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
