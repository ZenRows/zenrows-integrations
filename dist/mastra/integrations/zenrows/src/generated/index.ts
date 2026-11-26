// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import type { ZenrowsClientOptions } from '../client.js';
import { createZenrowsCancelBatchJobTool } from './cancel-batch-job.js';
import { createZenrowsCreateBatchJobTool } from './create-batch-job.js';
import { createZenrowsDownloadCrawlTool } from './download-crawl.js';
import { createZenrowsGetBatchJobTool } from './get-batch-job.js';
import { createZenrowsGetBatchResultsTool } from './get-batch-results.js';
import { createZenrowsGetBatchTaskContentTool } from './get-batch-task-content.js';
import { createZenrowsGetCrawlContentTool } from './get-crawl-content.js';
import { createZenrowsGetCrawlTool } from './get-crawl.js';
import { createZenrowsGetExtractDomainStatusTool } from './get-extract-domain-status.js';
import { createZenrowsListExtractDomainsTool } from './list-extract-domains.js';
import { createZenrowsRequestExtractDomainTool } from './request-extract-domain.js';
import { createZenrowsStartCrawlTool } from './start-crawl.js';
import { createZenrowsStopCrawlTool } from './stop-crawl.js';

export { createZenrowsCancelBatchJobTool, zenrowsCancelBatchJobInputSchema } from './cancel-batch-job.js';
export { createZenrowsCreateBatchJobTool, zenrowsCreateBatchJobInputSchema } from './create-batch-job.js';
export { createZenrowsDownloadCrawlTool, zenrowsDownloadCrawlInputSchema } from './download-crawl.js';
export { createZenrowsGetBatchJobTool, zenrowsGetBatchJobInputSchema } from './get-batch-job.js';
export { createZenrowsGetBatchResultsTool, zenrowsGetBatchResultsInputSchema } from './get-batch-results.js';
export { createZenrowsGetBatchTaskContentTool, zenrowsGetBatchTaskContentInputSchema } from './get-batch-task-content.js';
export { createZenrowsGetCrawlContentTool, zenrowsGetCrawlContentInputSchema } from './get-crawl-content.js';
export { createZenrowsGetCrawlTool, zenrowsGetCrawlInputSchema } from './get-crawl.js';
export { createZenrowsGetExtractDomainStatusTool, zenrowsGetExtractDomainStatusInputSchema } from './get-extract-domain-status.js';
export { createZenrowsListExtractDomainsTool, zenrowsListExtractDomainsInputSchema } from './list-extract-domains.js';
export { createZenrowsRequestExtractDomainTool, zenrowsRequestExtractDomainInputSchema } from './request-extract-domain.js';
export { createZenrowsStartCrawlTool, zenrowsStartCrawlInputSchema } from './start-crawl.js';
export { createZenrowsStopCrawlTool, zenrowsStopCrawlInputSchema } from './stop-crawl.js';

/** One tool for every endpoint we offer that has no hand-written tool. */
export function createZenrowsGeneratedTools(options?: ZenrowsClientOptions) {
  return {
    zenrowsListExtractDomains: createZenrowsListExtractDomainsTool(options),
    zenrowsRequestExtractDomain: createZenrowsRequestExtractDomainTool(options),
    zenrowsGetExtractDomainStatus: createZenrowsGetExtractDomainStatusTool(options),
    zenrowsCreateBatchJob: createZenrowsCreateBatchJobTool(options),
    zenrowsGetBatchJob: createZenrowsGetBatchJobTool(options),
    zenrowsCancelBatchJob: createZenrowsCancelBatchJobTool(options),
    zenrowsGetBatchResults: createZenrowsGetBatchResultsTool(options),
    zenrowsGetBatchTaskContent: createZenrowsGetBatchTaskContentTool(options),
    zenrowsStartCrawl: createZenrowsStartCrawlTool(options),
    zenrowsGetCrawl: createZenrowsGetCrawlTool(options),
    zenrowsDownloadCrawl: createZenrowsDownloadCrawlTool(options),
    zenrowsGetCrawlContent: createZenrowsGetCrawlContentTool(options),
    zenrowsStopCrawl: createZenrowsStopCrawlTool(options),
  };
}
