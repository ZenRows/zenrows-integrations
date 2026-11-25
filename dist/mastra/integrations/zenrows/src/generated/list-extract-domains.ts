// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://api.zenrows.com/v1","path":"/extract/domains","key":"header","responses":{"200":"The domains Extract serves.","401":"The API key is missing or invalid."}};

export const zenrowsListExtractDomainsInputSchema = z.object({
});

export function createZenrowsListExtractDomainsTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-list-extract-domains',
    description: 'Lists domains that Extract announces as ready. The list is not complete: a domain missing from it may still work, so try Extract Structured Data and branch on REQS007 instead of relying on it. Costs no credits; safe to retry.',
    inputSchema: zenrowsListExtractDomainsInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
