import type { ZenrowsClientOptions } from './client.js';
import { createZenrowsExtractTool } from './extract.js';
import { createZenrowsScrapeTool } from './scrape.js';

export function createZenrowsTools(options?: ZenrowsClientOptions) {
  return {
    zenrowsScrape: createZenrowsScrapeTool(options),
    zenrowsExtract: createZenrowsExtractTool(options),
  };
}
