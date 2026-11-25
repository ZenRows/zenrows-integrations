import type { ZenrowsClientOptions } from './client.js';
import { createZenrowsExtractTool } from './extract.js';
import { createZenrowsGeneratedTools } from './generated/index.js';
import { createZenrowsScrapeTool } from './scrape.js';

/** Every Zenrows tool: scrape, extract, and one for each other endpoint Zenrows offers. */
export function createZenrowsTools(options?: ZenrowsClientOptions) {
  return {
    zenrowsScrape: createZenrowsScrapeTool(options),
    zenrowsExtract: createZenrowsExtractTool(options),
    ...createZenrowsGeneratedTools(options),
  };
}
