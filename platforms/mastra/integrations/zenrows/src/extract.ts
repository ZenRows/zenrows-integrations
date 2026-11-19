import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { requestZenrows } from './client.js';
import type { ZenrowsClientOptions } from './client.js';
import { zenrowsExtractInputSchema } from './schemas.js';

const outputSchema = z.object({
  url: z.string(),
  data: z.unknown().describe('The fields ZenRows extracted from the page, named the way the site names them.'),
  credits: z.number().nullable().describe('Credits the request used; null when ZenRows did not report them.'),
});

export function createZenrowsExtractTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-extract',
    description:
      {{api:extract summary}} +
      " as JSON, with fields named the way the site names them (a product's name and price, a listing's rows, an article's byline) and no selectors to write. For the page's own content, use zenrows-scrape instead. " +
      {{text:extract-no-credits}} +
      ', which costs ' +
      {{text:credit-weights}} +
      '.',
    inputSchema: zenrowsExtractInputSchema,
    outputSchema,
    execute: async params => {
      const response = await requestZenrows(options, { ...params, extract: 'auto' });
      return { url: params.url, data: JSON.parse(response.body) as unknown, credits: response.credits };
    },
  });
}
