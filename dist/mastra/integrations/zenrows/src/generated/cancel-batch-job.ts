// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = {"method":"POST","server":"https://async.api.zenrows.com/v1","path":"/jobs/{job_id}/cancel","key":"header","responses":{"200":"Run is stopped. Body is the refreshed Run object.","401":"Missing / invalid API key.","403":"`permission_denied`: the Batch API is not enabled for this\naccount. Any `/v1` route can return it.\n","404":"Resource not found (or not owned by caller).","409":"Latest run is not in a stoppable state."}};

export const zenrowsCancelBatchJobInputSchema = z.object({
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).describe('Assigned by the server on submit.'),
});

export function createZenrowsCancelBatchJobTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-cancel-batch-job',
    description: 'Cancel the current run. User-facing alias for `/stop`. Same semantics, same terminal `stopped` state, same response shape. This call uses no credits.',
    inputSchema: zenrowsCancelBatchJobInputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
