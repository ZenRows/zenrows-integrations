import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { requestZenrows } from './client.js';
import type { ZenrowsClientOptions } from './client.js';
import { zenrowsExtractInputSchema } from './schemas.js';
import {
  EXTRACT_NO_CREDITS,
  EXTRACT_SUMMARY,
  EXTRACT_TOOL,
  GET_EXTRACT_DOMAIN_STATUS_TOOL,
  PER_REQUEST_COST,
  REQUEST_EXTRACT_DOMAIN_TOOL,
  SCRAPE_TOOL,
} from './spec.js';

const outputSchema = z.object({
  url: z.string(),
  data: z.unknown().describe('The fields Zenrows extracted from the page, named the way the site names them.'),
  credits: z.number().nullable().describe('Credits the request used; null when Zenrows did not report them.'),
});

export function createZenrowsExtractTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: EXTRACT_TOOL,
    description:
      EXTRACT_SUMMARY +
      " as JSON, with fields named the way the site names them (a product's name and price, a listing's rows, an article's byline) and no selectors to write. For the page's own content, use " +
      SCRAPE_TOOL +
      ' instead. ' +
      EXTRACT_NO_CREDITS +
      '. ' +
      PER_REQUEST_COST +
      ' A domain Zenrows has not prepared for Extract yet fails with REQS007: prepare it with ' +
      REQUEST_EXTRACT_DOMAIN_TOOL +
      ' and retry once ' +
      GET_EXTRACT_DOMAIN_STATUS_TOOL +
      ' reports it ready (both from createZenrowsAllTools()).',
    inputSchema: zenrowsExtractInputSchema,
    outputSchema,
    execute: async params => {
      const response = await requestZenrows(options, { ...params, extract: 'auto' });
      return { url: params.url, data: JSON.parse(response.body) as unknown, credits: response.credits };
    },
  });
}
