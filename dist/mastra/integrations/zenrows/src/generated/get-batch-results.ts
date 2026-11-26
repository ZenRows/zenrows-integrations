// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://async.api.zenrows.com/v1","path":"/jobs/{job_id}/results","key":"header","responses":{"200":"Page of results.","400":"Request validation failed.","401":"Missing / invalid API key.","403":"`permission_denied`: the Batch API is not enabled for this\naccount. Any `/v1` route can return it.\n","404":"Resource not found (or not owned by caller)."},"query":["status","cursor"]};

export const zenrowsGetBatchResultsInputSchema = z.object({
  status: z.enum(['all', 'successful', 'failed', 'processing']).optional().describe('`processing` covers both `pending` and `processing` task\nstates (anything not yet terminal).'),
  cursor: z.string().optional().describe('Opaque pagination token; echo `next_cursor`.'),
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).describe("The batch job's ID, as zenrows-create-batch-job returned it (job_id)."),
});

export function createZenrowsGetBatchResultsTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-batch-results',
    description: "Lists the tasks of a batch job's latest run, one page at a time, with each task's URL, status and task_id. Filter by status, and pass next_cursor back as cursor for the next page. Read a task's page with zenrows-get-batch-task-content. Safe to retry. This call uses no credits.",
    inputSchema: zenrowsGetBatchResultsInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
