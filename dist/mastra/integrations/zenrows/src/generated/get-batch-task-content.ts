// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"GET","server":"https://async.api.zenrows.com/v1","path":"/jobs/{job_id}/tasks/{task_id}/content","key":"header","responses":{"200":"Scraped content. `Content-Type` follows the task result's\n`type`: `text/html`, `application/json`, `text/markdown`,\n`text/plain` or `application/pdf`.\n","401":"Missing / invalid API key.","403":"`permission_denied`: the Batch API is not enabled for this\naccount. Any `/v1` route can return it.\n","404":"Resource not found (or not owned by caller).","409":"Task is still pending or processing.","410":"The result body is past the job's result-visibility window\n(14 days by default): `result_expired`.\n","422":"Task is failed. Body is the task's stored error as Problem\nJSON, so its `code` and `status` are the error's own, not\n422.\n"}};

export const zenrowsGetBatchTaskContentInputSchema = z.object({
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).describe('Assigned by the server on submit.'),
  task_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).describe('Server-assigned task id within a run. Use `external_id` for your own correlation id.'),
});

export function createZenrowsGetBatchTaskContentTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-get-batch-task-content',
    description: 'Fetch the scraped content for a task in the latest run. Latest-run shortcut. See `getBatchRunTaskContent` for explicit-run form. This call uses no credits.',
    inputSchema: zenrowsGetBatchTaskContentInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
