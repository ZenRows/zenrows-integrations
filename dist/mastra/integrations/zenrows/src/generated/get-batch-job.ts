// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://async.api.zenrows.com/v1","path":"/jobs/{job_id}","key":"header","responses":{"200":"OK","401":"Missing / invalid API key.","403":"`permission_denied`: the Batch API is not enabled for this\naccount. Any `/v1` route can return it.\n","404":"Resource not found (or not owned by caller)."}};

export const zenrowsGetBatchJobInputSchema = z.object({
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).describe("The batch job's ID, as Create Batch Job returned it (job_id)."),
});

export function createZenrowsGetBatchJobTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-batch-job',
    description: 'Reads a batch job with its latest run: progress in latest_run.stats, spend in latest_run.stats.spend. Poll it after Create Batch Job until latest_run.status is terminal, then read Get Batch Results. Costs no credits; safe to retry.',
    inputSchema: zenrowsGetBatchJobInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
