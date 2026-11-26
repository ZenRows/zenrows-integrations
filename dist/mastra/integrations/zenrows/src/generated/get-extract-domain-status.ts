// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://api.zenrows.com/v1","path":"/extract/prepared-domains/{domain}","key":"header","responses":{"200":"The domain's most recent submission.","401":"The API key is missing or invalid.","404":"`not_found`: this domain has never been submitted."}};

export const zenrowsGetExtractDomainStatusInputSchema = z.object({
  domain: z.string().describe('The domain, without scheme.'),
});

export function createZenrowsGetExtractDomainStatusTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-extract-domain-status',
    description: 'Reads the preparation status of a domain submitted with zenrows-request-extract-domain. Branch on status: preparing, ready or failed. Safe to retry. This call uses no credits.',
    inputSchema: zenrowsGetExtractDomainStatusInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
