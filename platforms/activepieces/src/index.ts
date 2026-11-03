import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { createPiece, PieceCategory } from '@activepieces/pieces-framework';
import { extractStructuredDataAction } from './lib/actions/extract-structured-data';
import { getAccountUsageAction } from './lib/actions/get-account-usage';
import { scrapeUrlAction } from './lib/actions/scrape-url';
import { zenrowsAuth } from './lib/auth';
import { ZENROWS_API_BASE_URL } from './lib/common/client';

export const zenrows = createPiece({
  displayName: 'ZenRows',
  description:
    'Web scraping API that gets past anti-bot systems and returns pages as Markdown, HTML, screenshots or structured JSON.',
  auth: zenrowsAuth,
  minimumSupportedRelease: '0.88.2',
  logoUrl: 'https://cdn.activepieces.com/pieces/zenrows.png',
  categories: [PieceCategory.ARTIFICIAL_INTELLIGENCE, PieceCategory.PRODUCTIVITY],
  authors: ['imoital'],
  actions: [
    scrapeUrlAction,
    extractStructuredDataAction,
    getAccountUsageAction,
    createCustomApiCallAction({
      baseUrl: () => ZENROWS_API_BASE_URL,
      auth: zenrowsAuth,
      authMapping: async (auth) => ({
        'X-API-Key': auth.secret_text,
      }),
      props: {
        url: {
          description:
            'A full URL or a path relative to https://api.zenrows.com/v1, e.g. /subscriptions/self/details. The API key is sent in the X-API-Key header.',
        },
      },
    }),
  ],
  triggers: [],
});
