import { z } from "zod";

/**
 * The Zenrows Fetch query parameters BOTH endpoints send, mirrored from
 * the published reference (https://docs.zenrows.com/fetch/api-reference).
 * The faithful vendor mirror (design D25): optionality only, no defaults.
 * What an endpoint pins for itself lives at its binding in endpoint.ts.
 *
 * Every rule the API enforces is stated in the `.describe()` of the field
 * it constrains rather than in `meta.notes`: that is where a caller
 * composing a request reads it, and the JSON Schema a host hands an agent
 * carries it there too. A `.superRefine` would be the obvious way to make
 * an invalid pair unconstructable, but refinements do not survive
 * `z.toJSONSchema` (design D6), so the describes are the only place these
 * rules reach an agent and the vendor answers a violation as error-as-data.
 */
export const zFetchParams = z.strictObject({
    // The scheme is pinned with .regex() rather than z.url()'s `protocol`
    // option: `protocol` is a refinement, and refinements do not survive
    // `z.toJSONSchema` (design D6), so the compiled doc would carry a bare
    // `format: "uri"` and accept ftp:, file: and javascript: URLs. A
    // `.regex()` reaches the doc as a JSON Schema `pattern` and holds.
    url: z.url().regex(/^https?:\/\//).describe(
        "The URL of the page to fetch. It must be http or https; any other " +
            "scheme is rejected before the request leaves.",
    ),
    mode: z.literal("auto").describe(
        "Set to 'auto' to turn on Adaptive Stealth Mode. " +
            "Adaptive Stealth Mode starts from the cheapest configuration that can work and escalates to JavaScript rendering or Premium Proxies only when the page needs them, and only the configuration that succeeds is charged" +
            ". It cannot be combined with js_render or premium_proxy: a " +
            "request carrying both is rejected with a 400 (REQS004). Leave " +
            "mode out to set those two flags yourself.",
    ).optional(),
    js_render: z.boolean().describe(
        "Render the page in a headless browser before returning it, for " +
            "content that only exists once JavaScript has run. A plain " +
            "request draws 1 credit, JavaScript rendering 5, Premium " +
            "Proxies 10, and the two together 25. It cannot be combined " +
            "with mode=auto, which picks rendering for you: that pair is " +
            "rejected with a 400 (REQS004).",
    ).optional(),
    js_instructions: z.string().describe(
        "A JSON array of browser instructions (click, fill, scroll, wait) " +
            "run on the page before its content is returned, for example " +
            '[{"click":".load-more"},{"wait":2000}]' +
            ". Needs js_render.",
    ).optional(),
    custom_headers: z.boolean().describe(
        "Forward the headers you send on this request, such as cookies or " +
            "a referer, to the target site.",
    ).optional(),
    premium_proxy: z.boolean().describe(
        "Route the request through residential IPs, which most protected " +
            "sites require. A plain request draws 1 credit, Premium " +
            "Proxies 10, JavaScript rendering 5, and the two together 25. " +
            "It cannot be combined with mode=auto, which picks proxies " +
            "for you: that pair is rejected with a 400 (REQS004).",
    ).optional(),
    proxy_country: z.string().describe(
        "The country the exit IP sits in, as an ISO 3166-1 alpha-2 code " +
            "in lowercase, for example 'us' or 'de'. It needs something " +
            "to route through: send it with mode=auto, or with " +
            "premium_proxy. On its own, or beside js_render without " +
            "premium_proxy, the API answers 400 (REQS004). Geotargeting " +
            "draws the Premium Proxies rate of 10 credits either way, " +
            "mode=auto included.",
    ).optional(),
    session_id: z.number().int().describe(
        "Reuse the same exit IP across requests for up to 10 minutes. Any " +
            "integer you pick names the session; send it again on each " +
            "request that should share the IP.",
    ).optional(),
    original_status: z.boolean().describe(
        "Return the target site's own HTTP status code instead of the " +
            "Zenrows one. Be careful pairing it with " +
            "allowed_status_codes: a non-2xx status is a provider error " +
            "here, so the page arrives digested as an error and the run " +
            "records no credits, while Zenrows still charges it.",
    ).optional(),
    allowed_status_codes: z.string().describe(
        "Comma-separated status codes whose body is returned instead of " +
            "raising an error, for example '404,500'. Use it to read an " +
            "error page's content rather than failing on it. Zenrows " +
            "charges these requests.",
    ).optional(),
    wait_for: z.string().describe(
        "A CSS selector to wait for before the page is returned, for " +
            "example '.product-price'. Needs js_render.",
    ).optional(),
    wait: z.number().int().describe(
        "Milliseconds to wait after load before the page is returned. " +
            "Needs js_render.",
    ).optional(),
    block_resources: z.string().describe(
        "Comma-separated resource types not to load, for example " +
            "'image,media,font'. Blocking is on by default; narrowing it " +
            "makes a page slower but more complete.",
    ).optional(),
});
