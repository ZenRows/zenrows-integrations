import { HttpMethod } from '@activepieces/pieces-common';
import { createAction, OutputSchema } from '@activepieces/pieces-framework';
import { zenrowsAuth } from '../auth';
import { zenrowsClient } from '../common/client';

export const getAccountUsageAction = createAction({
  auth: zenrowsAuth,
  name: 'get_account_usage',
  classification: 'READ',
  displayName: 'Get Account Usage',
  description: 'Get your ZenRows plan, credits used this period and concurrency.',
  audience: 'both',
  outputSchema: usageOutputSchema(),
  aiMetadata: {
    description:
      'Returns the ZenRows plan, credits used and remaining in the current billing period, and concurrency in use. Use it to check the budget before a large scraping job or to alert when usage is high. Free to call and safe to retry.',
    idempotent: true,
  },
  props: {},
  async run(context) {
    const details = await zenrowsClient.request<SubscriptionDetails>({
      apiKey: context.auth.secret_text,
      method: HttpMethod.GET,
      path: '/subscriptions/self/details',
    });
    const creditLimit = details.credit_limit ?? null;
    const usageCredits = details.usage_credits ?? null;
    return {
      plan_name: details.plan?.name ?? null,
      plan_recurrence: details.plan?.recurrence ?? null,
      status: details.status ?? null,
      period_starts_at: details.period_starts_at ?? null,
      period_ends_at: details.period_ends_at ?? null,
      credit_limit: creditLimit,
      credits_used: usageCredits,
      credits_remaining:
        creditLimit === null || usageCredits === null ? null : Math.max(creditLimit - usageCredits, 0),
      usage_percent: details.usage_percent ?? null,
      usage_usd: details.usage ?? null,
      concurrency_limit: details.plan?.products?.api?.concurrency?.limit ?? null,
      concurrency_in_use: details.plan?.products?.api?.concurrency?.usage ?? null,
    };
  },
});

function usageOutputSchema(): OutputSchema {
  return {
    fields: [
      { key: 'plan_name', label: 'Plan' },
      { key: 'plan_recurrence', label: 'Billing Recurrence' },
      { key: 'status', label: 'Status' },
      { key: 'period_starts_at', label: 'Period Starts At', format: 'datetime' },
      { key: 'period_ends_at', label: 'Period Ends At', format: 'datetime' },
      { key: 'credit_limit', label: 'Credit Limit', format: 'number' },
      { key: 'credits_used', label: 'Credits Used', format: 'number' },
      { key: 'credits_remaining', label: 'Credits Remaining', format: 'number' },
      { key: 'usage_percent', label: 'Usage (%)', format: 'number' },
      { key: 'usage_usd', label: 'Spend (USD)', format: 'currency', currency: 'USD' },
      { key: 'concurrency_limit', label: 'Concurrency Limit', format: 'number' },
      { key: 'concurrency_in_use', label: 'Concurrency In Use', format: 'number' },
    ],
  };
}

type SubscriptionDetails = {
  status?: string;
  period_starts_at?: string;
  period_ends_at?: string;
  usage?: number;
  usage_credits?: number;
  credit_limit?: number;
  usage_percent?: number;
  plan?: {
    name?: string;
    recurrence?: string;
    products?: {
      api?: {
        concurrency?: {
          limit?: number;
          usage?: number;
        };
      };
    };
  };
};
