function buildScrapeParams({
  url,
  outputFormat,
  adaptive,
  jsRender,
  premiumProxy,
  proxyCountry,
  waitFor,
  wait,
  jsInstructions,
  forwardHeaders,
  sessionId,
}: ScrapeOptions): Record<string, string> {
  const isScreenshot = outputFormat === 'screenshot';
  const usesBrowser = isScreenshot || (!adaptive && jsRender === true);
  const usesPremiumProxy = !adaptive && premiumProxy === true;
  const needsBrowser = !isNilOrEmpty(waitFor) || !isNil(wait) || !isNilOrEmpty(jsInstructions);

  if (!adaptive && !usesBrowser && needsBrowser) {
    throw new Error(
      'Wait For Selector, Wait (ms) and JavaScript Instructions need JS Rendering. Turn on JS Rendering or Adaptive Stealth Mode.'
    );
  }
  if (!adaptive && !usesPremiumProxy && !isNilOrEmpty(proxyCountry)) {
    throw new Error(
      'Proxy Country needs Premium Proxy. Turn on Premium Proxy or Adaptive Stealth Mode.'
    );
  }

  return {
    url,
    ...(adaptive && !isScreenshot ? { mode: 'auto' } : {}),
    ...(usesBrowser ? { js_render: 'true' } : {}),
    ...(usesPremiumProxy ? { premium_proxy: 'true' } : {}),
    ...(!isNilOrEmpty(proxyCountry) ? { proxy_country: proxyCountry.trim().toLowerCase() } : {}),
    ...(!isNilOrEmpty(waitFor) ? { wait_for: waitFor } : {}),
    ...(!isNil(wait) ? { wait: String(wait) } : {}),
    ...(!isNilOrEmpty(jsInstructions) ? { js_instructions: normalizeJsInstructions({ jsInstructions }) } : {}),
    ...(forwardHeaders ? { custom_headers: 'true' } : {}),
    ...(!isNil(sessionId) ? { session_id: String(sessionId) } : {}),
    ...RESPONSE_TYPE_PARAMS[outputFormat],
  };
}

function buildExtractParams({
  url,
  method,
  selectors,
  fields,
  adaptive,
}: ExtractOptions): Record<string, string> {
  const base = { url, ...(adaptive ? { mode: 'auto' } : {}) };
  if (method === 'css') {
    const selectorMap = toStringRecord({ value: selectors });
    if (Object.keys(selectorMap).length === 0) {
      throw new Error('Add at least one field with a CSS selector, for example title → h1.');
    }
    return { ...base, css_extractor: JSON.stringify(selectorMap) };
  }
  const requestedFields = (fields ?? [])
    .filter((field): field is string => typeof field === 'string')
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
  return {
    ...base,
    extract: 'auto',
    ...(requestedFields.length > 0 ? { extract_fields: requestedFields.join(',') } : {}),
  };
}

function toStringRecord({
  value,
}: {
  value: Record<string, unknown> | null | undefined;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).flatMap(([key, entry]) =>
      typeof entry === 'string' && entry.trim().length > 0 && key.trim().length > 0
        ? [[key.trim(), entry.trim()]]
        : []
    )
  );
}

function normalizeJsInstructions({ jsInstructions }: { jsInstructions: string }): string {
  try {
    const parsed: unknown = JSON.parse(jsInstructions);
    if (!Array.isArray(parsed)) {
      throw new Error('not an array');
    }
    return JSON.stringify(parsed);
  } catch {
    throw new Error(
      'JavaScript Instructions must be a JSON array, for example [{"click": ".load-more"}, {"wait": 1000}].'
    );
  }
}

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function isNilOrEmpty(value: string | null | undefined): value is null | undefined {
  return isNil(value) || value.trim().length === 0;
}

const RESPONSE_TYPE_PARAMS: Record<ScrapeOutputFormat, Record<string, string>> = {
  html: {},
  markdown: { response_type: 'markdown' },
  plaintext: { response_type: 'plaintext' },
  screenshot: { screenshot_fullpage: 'true', screenshot_format: 'png' },
};

export const zenrowsParams = {
  buildScrapeParams,
  buildExtractParams,
  toStringRecord,
};

export type ScrapeOutputFormat = 'html' | 'markdown' | 'plaintext' | 'screenshot';

export type ExtractMethod = 'css' | 'auto';

type ScrapeOptions = {
  url: string;
  outputFormat: ScrapeOutputFormat;
  adaptive: boolean;
  jsRender?: boolean;
  premiumProxy?: boolean;
  proxyCountry?: string | null;
  waitFor?: string | null;
  wait?: number | null;
  jsInstructions?: string | null;
  forwardHeaders: boolean;
  sessionId?: number | null;
};

type ExtractOptions = {
  url: string;
  method: ExtractMethod;
  selectors?: Record<string, unknown> | null;
  fields?: unknown[] | null;
  adaptive: boolean;
};
