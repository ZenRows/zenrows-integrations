import { createAction, Property } from '@activepieces/pieces-framework';
import { zenrowsAuth } from '../auth';
import { zenrowsClient } from '../common/client';

export const extractStructuredDataAction = createAction({
  auth: zenrowsAuth,
  name: 'extract_structured_data',
  classification: 'READ',
  displayName: 'Extract Structured Data',
  description: 'Get specific data from a web page as JSON, using CSS selectors or automatic extraction.',
  audience: 'both',
  aiMetadata: {
    description:
      'Fetches one web page through ZenRows and returns structured JSON instead of raw content. Use the CSS selectors method when you know the page structure (field name → selector), or the automatic method to let ZenRows detect fields such as products, prices or titles on supported sites. Use Scrape URL instead when you need the whole page. Read-only, safe to retry, spends ZenRows credits.',
    idempotent: true,
  },
  props: {
    url: Property.ShortText({
      displayName: 'URL',
      description: 'The full address of the page to extract data from.',
      required: true,
    }),
    method: Property.StaticDropdown<'css' | 'auto'>({
      displayName: 'Extraction Method',
      description:
        'CSS Selectors works on any site. Automatic needs no setup and works on any domain prepared for Extract; prepare one with the Custom API Call action (POST /extract/prepared-domains).',
      required: true,
      defaultValue: 'css',
      options: {
        disabled: false,
        options: [
          { label: 'CSS Selectors', value: 'css' },
          { label: 'Automatic', value: 'auto' },
        ],
      },
    }),
    selectors: Property.Object({
      displayName: 'CSS Selectors',
      description:
        'For the CSS Selectors method. Each key is a name for the output field and each value is the CSS selector to read, e.g. title → h1, price → .price. Add @attribute to read an attribute, e.g. link → a.product @href.',
      required: false,
    }),
    fields: Property.Array({
      displayName: 'Fields',
      description:
        'For the Automatic method. Optional list of fields to return, using dots for nested fields, e.g. products.name. Leave empty to get every field.',
      required: false,
    }),
    adaptive: Property.Checkbox({
      displayName: 'Adaptive Stealth Mode',
      description:
        'Recommended. ZenRows adds JS rendering or premium proxies only when the page needs them.',
      required: false,
      defaultValue: true,
    }),
  },
  async run(context) {
    const { propsValue } = context;
    const fields = (propsValue.fields ?? []).filter((f): f is string => typeof f === 'string' && f.trim() !== '');
    const response = await zenrowsClient.fetchPage({
      apiKey: context.auth.secret_text,
      params: {
        url: propsValue.url,
        ...(propsValue.adaptive !== false ? { mode: 'auto' } : {}),
        ...(propsValue.method === 'auto'
          ? { extract: 'auto', ...(fields.length ? { extract_fields: fields.join(',') } : {}) }
          : { css_extractor: JSON.stringify(propsValue.selectors ?? {}) }),
      },
      responseType: 'json',
    });
    // Automatic extraction answers { html, parsed }; the flow wants the data,
    // not the page it came from (https://docs.zenrows.com/extract/setup#response).
    return propsValue.method === 'auto' ? response.body.parsed ?? response.body : response.body;
  },
});
