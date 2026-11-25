import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { requestZenrows } from './client.js';
import type { ZenrowsClientOptions } from './client.js';
import { zenrowsScrapeInputSchema } from './schemas.js';
import { CREDIT_WEIGHTS, FETCH_SUMMARY } from './spec.js';

const outputSchema = z.object({
  url: z.string(),
  content: z.string().describe('The page as Markdown, plaintext or HTML, or the css_extractor fields as JSON text.'),
  credits: z.number().nullable().describe('Credits the request used; null when Zenrows did not report them.'),
});

export function createZenrowsScrapeTool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: 'zenrows-scrape',
    description:
      FETCH_SUMMARY +
      ' through Zenrows and return its content: Markdown by default, plaintext, or the HTML. With css_extractor it returns just the named fields as JSON text. For the structured fields of a product, article or listing page with no selectors to write, use zenrows-extract instead. Zenrows charges ' +
      CREDIT_WEIGHTS +
      '; mode auto picks the cheapest configuration that works.',
    inputSchema: zenrowsScrapeInputSchema,
    outputSchema,
    execute: async ({ response_type = 'markdown', ...params }) => {
      // The API has no 'html' value: sending no response_type is how the HTML is asked for.
      const response = await requestZenrows(options, {
        ...params,
        response_type: response_type === 'html' ? undefined : response_type,
      });
      return { url: params.url, content: response.body, credits: response.credits };
    },
  });
}
