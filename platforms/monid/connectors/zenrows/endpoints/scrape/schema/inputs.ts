import { z } from "zod";
import { zFetchParams } from "../../../schema/common.ts";

/**
 * `zenrows#scrape` query parameters: the shared Fetch mirror plus the
 * three that shape what comes back instead of how the page is fetched.
 * Faithful to the vendor (design D25): the endpoint's own `html` value
 * and its default live at the binding in endpoint.ts, not here.
 */
export const zScrapeQueryParams = zFetchParams.extend({
    response_type: z.enum(["markdown", "plaintext"]).describe(
        "Convert the page before returning it. 'markdown' and " +
            "'plaintext' are the only values the API takes; 'html', " +
            "'text' and anything else answer 400. Omitting it returns the " +
            "page's own HTML. The API rejects it beside outputs with a " +
            "400. ('pdf' exists on the API but needs js_render and " +
            "answers with a binary body, so it is not offered here.)",
    ).optional(),
    css_extractor: z.string().describe(
        "A JSON object of field name to CSS selector, applied to the " +
            "fetched page, for example " +
            '{"title":"h1","price":".price"}' +
            ". The response is those fields as JSON. " +
            {{text:css-extractor-overrides-response-type}} +
            ". It does coexist with outputs.",
    ).optional(),
    outputs: z.string().describe(
        "A comma-separated list of the data types to pull out of the " +
            "fetched HTML: emails, phone_numbers, headings, images, " +
            "audios, videos, links, menus, hashtags, metadata, tables, " +
            "favicon, or '*' for every one. The API rejects it beside " +
            "response_type with a 400. This endpoint sends a " +
            "response_type unless you ask for 'html', which sends none, " +
            "so pair outputs with response_type 'html'.",
    ).optional(),
});
