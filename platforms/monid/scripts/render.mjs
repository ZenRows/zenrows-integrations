// Builds the connector's input schemas from the published API spec, so the
// parameter text lives in one place instead of being written out per host.
// The spec carries the cross-field rules now (mode=auto against js_render and
// premium_proxy, what proxy_country needs behind it, pdf needing js_render,
// response_type against outputs), which is what makes generating them safe:
// monid cannot enforce those rules in the schema, because refinements do not
// survive z.toJSONSchema, so the describes are the only place they reach an
// agent and they have to be right.
//
// What is NOT generated, and why:
//   - which parameters each endpoint offers. shared/endpoints.yaml slices
//     GET / into `fetch` and `extract`; this connector splits the same
//     operation differently (its extract keeps the whole Fetch mirror and
//     pins extract=auto at the binding), so the lists below are its own.
//   - the markdown default and the `html` value the API has no equivalent
//     for. Both are bindings, and they stay in endpoints/scrape/endpoint.ts.
//
// npm run render runs this.

const where = "platforms/monid/scripts/render.mjs";

// The Fetch parameters both endpoints send, in the order they are declared.
const shared = [
    "url",
    "mode",
    "js_render",
    "js_instructions",
    "custom_headers",
    "premium_proxy",
    "proxy_country",
    "session_id",
    "original_status",
    "allowed_status_codes",
    "wait_for",
    "wait",
    "block_resources",
];
const scrapeOnly = ["response_type", "css_extractor", "outputs"];
const extractOnly = ["extract_fields"];

// Appended to the spec's own text: how THIS connector behaves, which monid's
// engine knows and the spec cannot. A vendor fact the spec leaves out does not
// belong here — the credit weights live in shared/text/credit-weights.md and
// reach the describes through `creditWeights` below.
const notes = {
    outputs:
        "This endpoint sends a response_type unless you ask for 'html', which sends none, so pair outputs with response_type 'html'.",
    original_status:
        "Zenrows counts a 404 or 410 from the target as a request it carried out, and charges for it, so such a run settles at the credits it drew and reports the target's status beside the result rather than as a failure.",
    allowed_status_codes: "Zenrows charges these requests.",
    css_extractor:
        "It overrides response_type, which is why this endpoint's own 'html' value exists, and it does coexist with outputs.",
};

// A Fetch parameter the shared `fetch` slice does not list yet. Written out
// here rather than left off, so the connector keeps offering it. Adding it to
// shared/endpoints.yaml would let this list go.
const ownParameters = {
    custom_headers: {
        type: "boolean",
        description:
            "Forward the headers you send on this request, such as cookies or a referer, to the target site.",
    },
};

// Enum values the API takes that this connector does not offer. `pdf` needs
// js_render and answers with a binary body, which is not Json and would need
// an output contract of its own.
const dropped = { response_type: ["pdf"] };

// Dropping a value makes the spec's own sentence wrong, because it describes
// the value that is now gone. Every parameter in `dropped` therefore has to
// replace its description here instead of appending to it, and zod() throws
// when one does not: the agent reading the compiled schema must never be told
// about a value its enum rejects.
const replacedDescriptions = {
    response_type:
        "Convert the page before returning it. 'markdown' and 'plaintext' are the only values this endpoint takes; anything else answers 400 REQS004. Sending it together with outputs also answers 400 REQS004.",
};

// The two flags whose describe carries the credit weights. The sentence is
// shared/text/credit-weights.md, inlined with `{{< }}` rather than built here,
// so the rates have one home across every host. `{{text:}}` is the other half
// of the same pair and would be wrong: it emits a quoted JSON literal, for code
// that needs a standalone string, and this one is concatenated into a describe
// that is quoted as a whole.
const carriesCreditWeights = ["js_render", "premium_proxy"];

const str = (value) => JSON.stringify(value);

/** One zod expression for a parameter, from its JSON Schema. */
function zod(name, schema, required, creditWeights) {
    const values = schema.enum &&
        schema.enum.filter((v) => !(dropped[name] ?? []).includes(v));
    let base;
    if (values) {
        if (!values.length) throw new Error(`${where}: ${name} has no enum values left`);
        base = values.length === 1 ? `z.literal(${str(values[0])})` : `z.enum([${values.map(str).join(", ")}])`;
    } else if (schema.format === "uri") {
        if (!schema.pattern) throw new Error(`${where}: ${name} is a uri with no pattern to pin the scheme`);
        // A .regex() reaches the compiled doc as a JSON Schema `pattern`;
        // z.url()'s own `protocol` option is a refinement and would not.
        base = `z.url().regex(${new RegExp(schema.pattern)})`;
    } else if (schema.type === "boolean") {
        base = "z.boolean()";
    } else if (schema.type === "integer") {
        base = "z.number().int()";
    } else if (schema.type === "string") {
        base = "z.string()";
    } else {
        throw new Error(`${where}: ${name} has type ${schema.type}, which this generator does not map`);
    }
    if (dropped[name] && !replacedDescriptions[name]) {
        throw new Error(
            `${where}: ${name} drops an enum value, so its description has to be replaced, not appended to`,
        );
    }
    const spec = replacedDescriptions[name] ?? schema.description;
    const weights = carriesCreditWeights.includes(name) ? creditWeights : undefined;
    const description = [spec, weights, notes[name]].filter(Boolean).join(" ");
    if (!description) throw new Error(`${where}: ${name} has no description in the spec`);
    return `    ${name}: ${base}.describe(\n        ${str(description)},\n    )${required ? "" : ".optional()"},\n`;
}

const header = `// Generated by ${where} from the published API spec.
// Edit the spec, or this script's own lists, rather than this file.
`;

export default function render({ apiEndpoints, fill }) {
    // fill() is not applied to what a host renderer returns, so the token is
    // resolved here. A typo would survive as text, and the render's
    // leftover-token check would then fail the build rather than ship it.
    const creditWeights = fill("Zenrows charges {{< credit-weights }}.");
    const endpoints = apiEndpoints();
    const query = {};
    const required = new Set();
    for (const key of ["fetch", "extract"]) {
        const endpoint = endpoints.find((e) => e.key === key);
        if (!endpoint) throw new Error(`${where}: shared/endpoints.yaml has no "${key}" endpoint`);
        const schema = endpoint.input?.query;
        if (!schema?.properties) throw new Error(`${where}: ${key} has no query parameters`);
        Object.assign(query, schema.properties);
        for (const name of schema.required ?? []) required.add(name);
    }
    Object.assign(query, ownParameters);

    const field = (name) => {
        if (!query[name]) throw new Error(`${where}: the spec no longer has a "${name}" parameter`);
        return zod(name, query[name], required.has(name), creditWeights);
    };

    return {
        "connectors/zenrows/schema/common.ts": `${header}import { z } from "zod";

/**
 * The Zenrows Fetch query parameters BOTH endpoints send. The faithful vendor
 * mirror (design D25): optionality only, no defaults. What an endpoint pins
 * for itself lives at its binding in endpoint.ts.
 *
 * Each API rule is stated in the describe of the field it constrains, because
 * a .superRefine would not survive z.toJSONSchema (design D6) and the
 * describes are the only place those rules reach an agent.
 */
export const zFetchParams = z.strictObject({
${shared.map(field).join("")}});
`,
        "connectors/zenrows/endpoints/scrape/schema/inputs.ts": `${header}import { z } from "zod";
import { zFetchParams } from "../../../schema/common.ts";

/**
 * \`zenrows#scrape\` query parameters: the shared Fetch mirror plus the three
 * that shape what comes back instead of how the page is fetched. The
 * endpoint's own \`html\` value and its markdown default live at the binding
 * in endpoint.ts, not here.
 */
export const zScrapeQueryParams = zFetchParams.extend({
${scrapeOnly.map(field).join("")}});
`,
        "connectors/zenrows/endpoints/extract/schema/inputs.ts": `${header}import { z } from "zod";
import { zFetchParams } from "../../../schema/common.ts";

/**
 * \`zenrows#extract\` query parameters: the shared Fetch mirror plus the field
 * selector. \`extract\` itself is not mirrored: the endpoint pins
 * \`extract=auto\` at its binding, because a caller cannot choose another
 * extraction strategy here.
 */
export const zExtractQueryParams = zFetchParams.extend({
${extractOnly.map(field).join("")}});
`,
    };
}
