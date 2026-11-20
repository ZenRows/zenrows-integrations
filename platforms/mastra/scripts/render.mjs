// Builds the package's zod input schemas (integrations/zenrows/src/schemas.ts)
// from the published API spec, so each parameter's type and text, and the
// cross-field rules the text states (mode=auto against js_render and
// premium_proxy, what proxy_country needs behind it), come from one place.
// npm run render runs this.
//
// Each tool starts from its slice of GET / in shared/endpoints.yaml. Every
// parameter in the slice is either exposed or excluded with a reason, so a
// parameter the slice gains fails the render until someone decides, the way
// shared/billing.yaml makes a new operation fail until it's placed.

const where = "platforms/mastra/scripts/render.mjs";

const tools = {
    scrape: {
        slice: "fetch",
        // Parameters of GET / outside the slice are additions, read from the spec all the same.
        expose: [
            "url",
            "response_type",
            "mode",
            "js_render",
            "premium_proxy",
            "proxy_country",
            "wait_for",
            "wait",
            "js_instructions",
            "css_extractor",
            "block_resources",
        ],
        excluded: {
            json_response: "it turns the answer into a JSON envelope, and the tool's content is the page",
            outputs: "it returns data types instead of the page, and the API rejects it beside the markdown default",
            session_id: "a sticky IP across calls is not something one tool call can use",
            original_status: "a non-2xx status would be thrown as an error and the page lost",
            allowed_status_codes: "it charges for error pages and returns them as if they were the page",
        },
    },
    extract: {
        slice: "extract",
        expose: ["url", "extract_fields", "mode", "js_render", "premium_proxy", "proxy_country"],
        excluded: {
            extract: "the tool pins extract=auto",
            css_extractor: "the scrape tool offers it, and with it the answer is those fields rather than Extract's",
        },
    },
};

// The spec's response_type offers pdf, a binary body with no place in a string
// output, and has no html, which the scrape tool sends as no response_type at
// all. The spec's description names its own values, so it is replaced.
const replaced = {
    response_type: {
        type: "string",
        enum: ["markdown", "plaintext", "html"],
        description:
            "What to return: 'markdown' (the default) for the page as Markdown, 'plaintext' for its text alone, 'html' for the page's own markup.",
    },
};

// The generated files are written the way oxfmt formats them under Mastra's
// .oxfmtrc.json (single quotes, 120 columns), so they pass its check as they
// are. check.sh's format gate catches a shape this does not cover.
const width = 120;

// A string literal as oxfmt quotes it: single quotes, unless the text holds
// more single quotes than double ones.
function quote(text) {
    const singles = text.split("'").length - 1;
    const doubles = text.split('"').length - 1;
    const json = JSON.stringify(text);
    if (doubles < singles) return json;
    return `'${json.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
}

// `<head> <value><end>` on one line when it fits, else the value on the next
// line, one level deeper: how oxfmt breaks an assignment or a property.
function assign(indent, head, value, end) {
    const line = `${indent}${head} ${value}${end}`;
    return line.length <= width ? `${line}\n` : `${indent}${head}\n${indent}  ${value}${end}\n`;
}

// A property whose value is a call chain on `z`: one line when it fits, else
// one call per line, and the last call's argument on its own line if needed.
function chain(name, calls) {
    const line = `  ${name}: z${calls.map((call) => `.${call}`).join("")},`;
    if (line.length <= width) return `${line}\n`;
    const last = calls.at(-1);
    const open = last.indexOf("(");
    const lastLine = `    .${last},`;
    const tail =
        lastLine.length <= width
            ? `${lastLine}\n`
            : `    .${last.slice(0, open)}(\n      ${last.slice(open + 1, -1)},\n    ),\n`;
    return `  ${name}: z\n${calls
        .slice(0, -1)
        .map((call) => `    .${call}\n`)
        .join("")}${tail}`;
}

function zod(name, schema, required, note) {
    const calls = [];
    if (schema.enum) {
        calls.push(
            schema.enum.length === 1 ? `literal(${quote(schema.enum[0])})` : `enum([${schema.enum.map(quote).join(", ")}])`,
        );
    } else if (schema.format === "uri") {
        if (!schema.pattern) throw new Error(`${where}: ${name} is a uri with no pattern to pin the scheme`);
        calls.push("string()", "url()", `regex(${new RegExp(schema.pattern)})`);
    } else if (schema.type === "boolean") {
        calls.push("boolean()");
    } else if (schema.type === "integer") {
        calls.push("number()", "int()");
        if (schema.minimum !== undefined) calls.push(`min(${schema.minimum})`);
    } else if (schema.type === "string") {
        calls.push("string()");
        if (schema.pattern) calls.push(`regex(${new RegExp(schema.pattern)})`);
    } else {
        throw new Error(`${where}: ${name} has type ${schema.type}, which this generator does not map`);
    }
    if (!required) calls.push("optional()");
    const description = [schema.description, note].filter(Boolean).join(" ");
    if (!description) throw new Error(`${where}: ${name} has no description in the spec`);
    calls.push(`describe(${quote(description)})`);
    return chain(name, calls);
}

const header = `// Generated from the ZenRows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
`;

export default function render({ apiEndpoints, fill }) {
    // fill() is not applied to what a host renderer returns, so the snippets
    // and the operation's parameters are resolved here.
    const creditWeights = fill("ZenRows charges {{< credit-weights }}.");
    const notes = {
        js_render: creditWeights,
        premium_proxy: creditWeights,
        css_extractor: fill(
            "The content is then the JSON text of those fields; {{< css-extractor-overrides-response-type }}.",
        ),
    };
    const endpoints = apiEndpoints();

    const schemas = Object.entries(tools).map(([tool, { slice, expose, excluded }]) => {
        const endpoint = endpoints.find((e) => e.key === slice);
        if (!endpoint) throw new Error(`${where}: shared/endpoints.yaml has no "${slice}" endpoint`);
        const sliced = endpoint.input?.query;
        if (!sliced?.properties) throw new Error(`${where}: ${slice} has no query parameters`);
        const operation = JSON.parse(fill(`{{api:${endpoint.operation} query}}`));

        const unplaced = Object.keys(sliced.properties).filter((name) => !expose.includes(name) && !(name in excluded));
        if (unplaced.length) {
            throw new Error(
                `${where}: the ${tool} tool neither exposes nor excludes ${unplaced.join(", ")} from shared/endpoints.yaml's ${slice}; add each to its expose list or to excluded with a reason`,
            );
        }
        const stale = Object.keys(excluded).filter((name) => !(name in sliced.properties));
        if (stale.length) throw new Error(`${where}: the ${tool} tool excludes ${stale.join(", ")}, which ${slice} no longer has`);

        const required = new Set([...(sliced.required ?? []), ...(operation.required ?? [])]);
        const fields = expose.map((name) => {
            const schema = replaced[name] ?? sliced.properties[name] ?? operation.properties?.[name];
            if (!schema) throw new Error(`${where}: ${endpoint.operation} has no "${name}" parameter for the ${tool} tool`);
            return zod(name, schema, required.has(name), notes[name]);
        });
        const id = `zenrows${tool[0].toUpperCase()}${tool.slice(1)}`;
        return `export const ${id}InputSchema = z.object({\n${fields.join("")}});\n`;
    });

    // The rest of what the package takes from the spec and shared/text/, as
    // constants, so the hand-written files hold no placeholders and oxfmt
    // formats them as they are written.
    const parsed = (placeholder) => JSON.parse(fill(placeholder));
    const constant = (name, placeholder) => assign("", `export const ${name} =`, quote(parsed(placeholder)), ";");
    const responses = Object.entries(parsed("{{api:fetch responses}}"))
        .map(([status, text]) => assign("  ", `${quote(status)}:`, quote(text), ","))
        .join("");

    return {
        "integrations/zenrows/src/schemas.ts": `${header}import { z } from 'zod';

${schemas.join("\n")}
export type ZenrowsScrapeInput = z.infer<typeof zenrowsScrapeInputSchema>;
export type ZenrowsExtractInput = z.infer<typeof zenrowsExtractInputSchema>;
`,
        "integrations/zenrows/src/spec.ts": `${header}
export const DEFAULT_BASE_URL: string = ${quote(parsed("{{api:fetch server}}"))};

// What each response status of a fetch means, keyed by status.
export const RESPONSES: Record<string, string> = {
${responses}};

${constant("FETCH_SUMMARY", "{{api:fetch summary}}")}${constant("EXTRACT_SUMMARY", "{{api:extract summary}}")}${constant(
            "CREDIT_WEIGHTS",
            "{{text:credit-weights}}",
        )}${constant("EXTRACT_NO_CREDITS", "{{text:extract-no-credits}}")}`,
    };
}
