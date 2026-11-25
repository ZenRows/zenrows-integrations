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
    description: 'List the domains Extract serves. The domains Extract lists publicly as ready. A domain in this list works with `extract=auto`. The list is not complete: some prepared domains are not listed and still work, so a domain missing from it is not proof it answers `REQS007`. Send the request and branch on `REQS007`, or prepare the domain with `requestExtractDomain`. Costs no credits. Documented at https://docs.zenrows.com/extract/endpoints. This call uses no credits.',
    inputSchema: zenrowsListExtractDomainsInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
