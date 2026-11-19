// Generated from the ZenRows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
import { z } from 'zod';

export const zenrowsScrapeInputSchema = z.object({
  url: z.string().url().regex(/^https?:\/\//).describe(
    "The URL of the page to retrieve. Only `http` and `https` URLs are accepted.",
  ),
  response_type: z.enum(["markdown", "plaintext", "html"]).optional().describe(
    "What to return: 'markdown' (the default) for the page as Markdown, 'plaintext' for its text alone, 'html' for the page's own markup.",
  ),
  mode: z.literal("auto").optional().describe(
    "Adaptive Stealth Mode. `auto` starts from the cheapest viable configuration and escalates to JavaScript rendering or premium proxies only when the target requires it. You are billed for the configuration that succeeds. It manages `js_render` and `premium_proxy` itself, so setting either alongside it answers 400 `REQS004`; `proxy_country` is allowed.",
  ),
  js_render: z.boolean().optional().describe(
    "Render the page in a headless browser before returning it. Required for content that only exists after JavaScript runs. Not allowed with `mode=auto` (400 `REQS004`). ZenRows charges 1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan.",
  ),
  premium_proxy: z.boolean().optional().describe(
    "Route the request through residential IPs. Required by most protected sites. Not allowed with `mode=auto` (400 `REQS004`). ZenRows charges 1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan.",
  ),
  proxy_country: z.string().regex(/^[a-z]{2}$/).optional().describe(
    "Two-letter country code for the exit IP. Requires `premium_proxy=true` or `mode=auto`, which then routes through premium proxies, so the request costs at least 10 credits. Alone, or with only `js_render`, the request answers 400 `REQS004`.",
  ),
  wait_for: z.string().optional().describe(
    "CSS selector to wait for before returning. Requires js_render.",
  ),
  wait: z.number().int().min(0).optional().describe(
    "Milliseconds to wait after load before returning. Requires js_render.",
  ),
  js_instructions: z.string().optional().describe(
    "JSON array of browser instructions (click, fill, scroll, wait) executed on the page before the content is returned. Requires `js_render=true` or `mode=auto`; without either the request answers 400 `REQS004`.",
  ),
  css_extractor: z.string().optional().describe(
    "JSON object mapping output keys to CSS selectors, applied to the retrieved page. The content is then the JSON text of those fields; css_extractor and response_type are alternatives rather than additive, and a request carrying both answers with the css_extractor fields.",
  ),
  block_resources: z.string().optional().describe(
    "Comma-separated resource types to block (for example `image,media,font`). Blocking is on by default.",
  ),
});

export const zenrowsExtractInputSchema = z.object({
  url: z.string().url().regex(/^https?:\/\//).describe(
    "The URL of the page to retrieve. Only `http` and `https` URLs are accepted.",
  ),
  extract_fields: z.string().optional().describe(
    "Comma-separated list of the fields `extract` should return, dot-notated for fields inside a group (for example `products.name,products.price`). Omit it to receive every field.",
  ),
  mode: z.literal("auto").optional().describe(
    "Adaptive Stealth Mode. `auto` starts from the cheapest viable configuration and escalates to JavaScript rendering or premium proxies only when the target requires it. You are billed for the configuration that succeeds. It manages `js_render` and `premium_proxy` itself, so setting either alongside it answers 400 `REQS004`; `proxy_country` is allowed.",
  ),
  js_render: z.boolean().optional().describe(
    "Render the page in a headless browser before returning it. Required for content that only exists after JavaScript runs. Not allowed with `mode=auto` (400 `REQS004`). ZenRows charges 1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan.",
  ),
  premium_proxy: z.boolean().optional().describe(
    "Route the request through residential IPs. Required by most protected sites. Not allowed with `mode=auto` (400 `REQS004`). ZenRows charges 1 credit for a basic request, 5 with JavaScript rendering, 10 with premium proxies and 25 with both, the same on every plan.",
  ),
  proxy_country: z.string().regex(/^[a-z]{2}$/).optional().describe(
    "Two-letter country code for the exit IP. Requires `premium_proxy=true` or `mode=auto`, which then routes through premium proxies, so the request costs at least 10 credits. Alone, or with only `js_render`, the request answers 400 `REQS004`.",
  ),
});

export type ZenrowsScrapeInput = z.infer<typeof zenrowsScrapeInputSchema>;
export type ZenrowsExtractInput = z.infer<typeof zenrowsExtractInputSchema>;
