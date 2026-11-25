import type { ZenrowsClientOptions } from './client.js';
import { createZenrowsExtractTool } from './extract.js';
import { createZenrowsGeneratedTools } from './generated/index.js';
import { createZenrowsScrapeTool } from './scrape.js';

/** The two tools most agents need: scrape a page, or extract its fields as JSON. */
export function createZenrowsTools(options?: ZenrowsClientOptions) {
  return {
    zenrowsScrape: createZenrowsScrapeTool(options),
    zenrowsExtract: createZenrowsExtractTool(options),
  };
}

/** Scrape and extract, plus one tool for every other endpoint Zenrows offers: batch jobs, crawls and Extract domains. */
export function createZenrowsAllTools(options?: ZenrowsClientOptions) {
  return {
    ...createZenrowsTools(options),
    ...createZenrowsGeneratedTools(options),
  };
}
