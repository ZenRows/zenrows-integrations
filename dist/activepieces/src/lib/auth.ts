import { HttpMethod } from '@activepieces/pieces-common';
import { PieceAuth } from '@activepieces/pieces-framework';
import { zenrowsClient } from './common/client';

export const zenrowsAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `
**Get your ZenRows API key:**

1. Sign in at https://app.zenrows.com (or create a free account).
2. Open the **Builder** or **Settings** page.
3. Copy your API key and paste it here.
  `,
  validate: async ({ auth }) => {
    try {
      await zenrowsClient.request({
        apiKey: auth,
        method: HttpMethod.GET,
        path: '/subscriptions/self/details',
      });
      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'Invalid API key' };
    }
  },
});
