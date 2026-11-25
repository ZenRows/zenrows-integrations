import { readFileSync } from "node:fs";

// Builds what the package takes from the published API spec. npm run render runs this.
//
// Scrape and extract are written by hand (src/scrape.ts, src/extract.ts), with
// their zod input schemas generated here (src/schemas.ts), so each parameter's
// type and text, and the cross-field rules the text states (mode=auto against
// js_render and premium_proxy, what proxy_country needs behind it), come from
// one place. Each starts from its slice of GET / in shared/endpoints.yaml.
// Every parameter in the slice is either exposed or excluded with a reason, so
// a parameter the slice gains fails the render until someone decides, the way
// shared/billing.yaml makes a new operation fail until it's placed.
//
// Every other endpoint we offer (shared/billing.yaml) gets a generated tool in
// src/generated/, the way the Activepieces piece gets its actions: one input
// per path, query or body field, worded by shared/actions.yaml (the same text as
// those actions), and from the spec where it says nothing. A new endpoint in
// shared/billing.yaml is a new tool at the next render. Mastra's oxfmt config skips **/generated/**, its place for generated code.
//
// The docs page is scripts/docs-page.mdx with the generated tools' table added.
//
// A failure the spec causes says "the API spec", which is what
// .github/workflows/api-changed.yml looks for to open its "hosts to update" issue.

const where = "platforms/mastra/scripts/render.mjs";

// The endpoints with a hand-written tool, by their key in apiEndpoints().
const handWritten = ["fetch", "extract"];

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
// all. The spec's description names its own values, so it is replaced. Every
// value the spec gives is offered or excluded with a reason, so a new one fails
// the render until someone decides, as a new parameter does.
const responseTypes = {
    offered: ["markdown", "plaintext"],
    excluded: { pdf: "a binary body has no place in the tool's string content" },
};
const replaced = {
    response_type: {
        type: "string",
        enum: [...responseTypes.offered, "html"],
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
        if (!schema.pattern) throw new Error(`${where}: the API spec gives ${name} a uri with no pattern to pin the scheme`);
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
        throw new Error(`${where}: the API spec gives ${name} type ${schema.type}, which this generator does not map`);
    }
    if (!required) calls.push("optional()");
    const description = [schema.description, note].filter(Boolean).join(" ");
    if (!description) throw new Error(`${where}: the API spec has no description for ${name}`);
    calls.push(`describe(${quote(description)})`);
    return chain(name, calls);
}

const header = `// Generated from the Zenrows API spec (https://www.zenrows.com/openapi.json) by
// platforms/mastra/scripts/render.mjs in ZenRows/zenrows-integrations.
// Change the spec or that script rather than this file.
`;

// A generated tool's input field as a zod expression, from its JSON Schema,
// nested objects and lists included. Defaults are left to the API.
function zodValue(name, schema, required, text) {
    let base;
    const alternatives = schema.oneOf ?? schema.anyOf;
    if (schema.enum) {
        base =
            schema.enum.length === 1
                ? `z.literal(${quote(schema.enum[0])})`
                : `z.enum([${schema.enum.map((v) => quote(String(v))).join(", ")}])`;
    } else if (alternatives) {
        const options = alternatives.map((option) => zodValue(name, option, true));
        base = options.length === 1 ? options[0] : `z.union([${options.join(", ")}])`;
    } else if (schema.type === "object") {
        if (schema.properties) {
            const inner = new Set(schema.required ?? []);
            const fields = Object.entries(schema.properties).map(
                ([key, value]) => `${key}: ${zodValue(`${name}.${key}`, value, inner.has(key))}`,
            );
            base = `z.object({ ${fields.join(", ")} })`;
        } else {
            const values =
                typeof schema.additionalProperties === "object"
                    ? zodValue(`${name}.*`, schema.additionalProperties, true)
                    : "z.unknown()";
            base = `z.record(z.string(), ${values})`;
        }
    } else if (schema.type === "array") {
        base = `z.array(${schema.items ? zodValue(`${name}[]`, schema.items, true) : "z.unknown()"})`;
        if (schema.minItems) base += `.min(${schema.minItems})`;
        if (schema.maxItems) base += `.max(${schema.maxItems})`;
    } else if (schema.type === "string") {
        base = schema.format === "uri" ? "z.string().url()" : "z.string()";
        if (schema.pattern) base += `.regex(${new RegExp(schema.pattern)})`;
        if (schema.maxLength) base += `.max(${schema.maxLength})`;
    } else if (schema.type === "integer" || schema.type === "number") {
        base = schema.type === "integer" ? "z.number().int()" : "z.number()";
        if (schema.minimum !== undefined) base += `.min(${schema.minimum})`;
        if (schema.maximum !== undefined) base += `.max(${schema.maximum})`;
    } else if (schema.type === "boolean") {
        base = "z.boolean()";
    } else if (schema.type === undefined) {
        // The spec leaves some fields open, such as a batch task's POST body.
        base = "z.unknown()";
    } else {
        throw new Error(`${where}: the API spec gives ${name} type ${schema.type}, which this generator does not map`);
    }
    if (!required) base += ".optional()";
    const description = text ?? schema.description?.trim();
    if (description) base += `.describe(${quote(description)})`;
    return base;
}

const pascal = (id) => id.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const kebab = (id) => id.replaceAll("_", "-");

// One generated tool: its file in src/generated/, and what the index and the
// docs page need to list it.
function generatedTool(endpoint, fill) {
    const name = pascal(endpoint.id);
    const inHeader = endpoint.keyIn.header === "X-API-Key";
    if (!inHeader && endpoint.keyIn.query !== "apikey") {
        throw new Error(`${where}: the API spec takes the key for ${endpoint.operation} neither in X-API-Key nor as apikey`);
    }

    const operation = {
        method: endpoint.method,
        server: endpoint.server,
        path: endpoint.path,
        key: inHeader ? "header" : "query",
        responses: JSON.parse(fill(`{{api:${endpoint.key} responses}}`)),
    };
    const fields = [];
    for (const [part, schema] of Object.entries(endpoint.input)) {
        if (schema.type !== "object" || !schema.properties) {
            throw new Error(`${where}: the API spec gives ${endpoint.operation} a ${part} that isn't an object with properties`);
        }
        if (part !== "path") operation[part] = Object.keys(schema.properties);
        const required = new Set(schema.required ?? []);
        for (const [field, value] of Object.entries(schema.properties)) {
            if (fields.some(([taken]) => taken === field)) {
                throw new Error(`${where}: the API spec has "${field}" in two places of ${endpoint.operation}`);
            }
            fields.push([field, zodValue(field, value, required.has(field), endpoint.wording.props[field])]);
        }
    }

    // shared/actions.yaml's ai, else the summary and the description's first
    // paragraph (the rest is for the API docs); then what it costs, from its kind
    // in shared/billing.yaml.
    const paragraph = (endpoint.description ?? "").trim().split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, " ");
    const summary = endpoint.name.replace(/\.$/, "");
    const what = endpoint.wording.ai ?? [`${summary}.`, paragraph].filter(Boolean).join(" ");
    const description = `${what} ${endpoint.wording.cost}`;

    const file = `${header}import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { callOperation } from '../client.js';
import type { ZenrowsClientOptions, ZenrowsOperation } from '../client.js';

const operation: ZenrowsOperation = ${JSON.stringify(operation)};

export const zenrows${name}InputSchema = z.object({
${fields.map(([field, value]) => `  ${field}: ${value},\n`).join("")}});

export function createZenrows${name}Tool(options: ZenrowsClientOptions = {}) {
  return createTool({
    id: ${quote(`zenrows-${kebab(endpoint.id)}`)},
    description: ${quote(description)},
    inputSchema: zenrows${name}InputSchema,
    execute: async input => callOperation(options, operation, input),
  });
}
`;
    return { endpoint, name, file: kebab(endpoint.id), source: file };
}

// How the docs page's table names each billing kind.
const billingLabels = { per_credit: "Per request", after_run: "After it runs, per page or task", free: "Free" };

function docsTable(tools) {
    const rows = tools.map(({ endpoint, name }) => {
        const label = billingLabels[endpoint.billing];
        if (!label) throw new Error(`${where}: no docs billing label for "${endpoint.billing}"; add one to billingLabels`);
        // shared/actions.yaml's description, else the spec's summary.
        const what = endpoint.wording.description ?? `${endpoint.name.replace(/\.$/, "")}.`;
        if (/[{}<>|]/.test(what)) throw new Error(`${where}: the API spec's summary of ${endpoint.operation}, or its description in shared/actions.yaml, has a character MDX would read`);
        return `| \`createZenrows${name}Tool()\` | \`zenrows-${kebab(endpoint.id)}\` | ${what} | ${label} |`;
    });
    return ["| Factory | Tool ID | What it does | Billing |", "| - | - | - | - |", ...rows].join("\n");
}

export default function render({ apiEndpoints, fill }) {
    // fill() is not applied to what a host renderer returns, so the snippets
    // and the operation's parameters are resolved here.
    const creditWeights = fill("{{cost:per_credit}}");
    const notes = {
        js_render: creditWeights,
        premium_proxy: creditWeights,
        css_extractor: fill(
            "The content is then the JSON text of those fields; {{< css-extractor-overrides-response-type }}.",
        ),
    };
    // How shared/actions.yaml's {{tool:<id>}} and {{field:<name>}} read here: a
    // tool by its ID (a hand-written one by its own), a field by its input name.
    const names = {
        tool: (e) => {
            const own = Object.keys(tools).find((tool) => tools[tool].slice === e.key);
            return own ? `zenrows-${own}` : `zenrows-${kebab(e.id)}`;
        },
        field: (name) => name,
    };
    const endpoints = apiEndpoints(names);

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

        if (expose.includes("response_type")) {
            const values = (sliced.properties.response_type ?? operation.properties?.response_type)?.enum ?? [];
            const known = [...responseTypes.offered, ...Object.keys(responseTypes.excluded)];
            const unplaced = values.filter((v) => !known.includes(v));
            if (unplaced.length) throw new Error(`${where}: the API spec gives response_type ${unplaced.join(", ")}, which the ${tool} tool neither offers nor excludes; add each to responseTypes`);
            const gone = known.filter((v) => !values.includes(v));
            if (gone.length) throw new Error(`${where}: the API spec gives response_type no ${gone.join(", ")}, which responseTypes still lists`);
        }
        const required = new Set([...(sliced.required ?? []), ...(operation.required ?? [])]);
        const fields = expose.map((name) => {
            const schema = replaced[name] ?? sliced.properties[name] ?? operation.properties?.[name];
            if (!schema) throw new Error(`${where}: the API spec has no "${name}" parameter in ${endpoint.operation} for the ${tool} tool`);
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
    // Tool IDs the hand-written tools name, read the way {{tool:<id>}} reads, so
    // a renamed tool can't leave a stale ID in their descriptions.
    const toolId = (name, id) => {
        const endpoint = endpoints.find((e) => e.id === id);
        if (!endpoint) throw new Error(`${where}: the API spec has no endpoint we offer by id ${id}, which the hand-written tools name`);
        return assign("", `export const ${name} =`, quote(names.tool(endpoint)), ";");
    };
    const toolIds = [
        toolId("REQUEST_EXTRACT_DOMAIN_TOOL", "request_extract_domain"),
        toolId("GET_EXTRACT_DOMAIN_STATUS_TOOL", "get_extract_domain_status"),
    ].join("");
    const responses = Object.entries(parsed("{{api:fetch responses}}"))
        .map(([status, text]) => assign("  ", `${quote(status)}:`, quote(text), ","))
        .join("");

    for (const key of handWritten) {
        if (!endpoints.some((e) => e.key === key)) throw new Error(`${where}: shared/billing.yaml no longer offers "${key}", which has a hand-written tool`);
    }
    const generated = endpoints.filter((e) => !handWritten.includes(e.key)).map((e) => generatedTool(e, fill));
    const files = Object.fromEntries(generated.map((t) => [`integrations/zenrows/src/generated/${t.file}.ts`, t.source]));
    // Mastra's lint wants imports in the order of their paths, compared as
    // written ('./get-crawl-content.js' before './get-crawl.js'); the tools keep
    // the spec's order.
    const path = (t) => `./${t.file}.js`;
    const byFile = [...generated].sort((a, b) => Number(path(a) > path(b)) - Number(path(a) < path(b)));
    files["integrations/zenrows/src/generated/index.ts"] = `${header}import type { ZenrowsClientOptions } from '../client.js';
${byFile.map((t) => `import { createZenrows${t.name}Tool } from './${t.file}.js';\n`).join("")}
${byFile.map((t) => `export { createZenrows${t.name}Tool, zenrows${t.name}InputSchema } from './${t.file}.js';\n`).join("")}
/** One tool for every endpoint we offer that has no hand-written tool. */
export function createZenrowsGeneratedTools(options?: ZenrowsClientOptions) {
  return {
${generated.map((t) => `    zenrows${t.name}: createZenrows${t.name}Tool(options),\n`).join("")}  };
}
`;

    const marker = "GENERATED_TOOLS_TABLE";
    const page = fill(readFileSync(new URL("./docs-page.mdx", import.meta.url), "utf8"));
    if (!page.includes(marker)) throw new Error(`${where}: scripts/docs-page.mdx has no ${marker} line for the generated tools`);
    files["docs/src/content/en/integrations/tools/zenrows.mdx"] = page.replace(marker, docsTable(generated));

    return {
        ...files,
        "integrations/zenrows/src/schemas.ts": `${header}import { z } from 'zod';

${schemas.join("\n")}
export type ZenrowsScrapeInput = z.infer<typeof zenrowsScrapeInputSchema>;
export type ZenrowsExtractInput = z.infer<typeof zenrowsExtractInputSchema>;
`,
        "integrations/zenrows/src/spec.ts": `${header}
export const DEFAULT_BASE_URL: string = ${quote(parsed("{{api:fetch server}}"))};

// The wait REQUEST_TIMEOUT (shared/text/request-timeout.md) asks clients for, in ms.
export const DEFAULT_TIMEOUT = ${fill("{{request_timeout_ms}}")};

// What each response status of a fetch means, keyed by status.
export const RESPONSES: Record<string, string> = {
${responses}};

${constant("FETCH_SUMMARY", "{{api:fetch summary}}")}${constant("EXTRACT_SUMMARY", "{{api:extract summary}}")}${assign(
            "",
            "export const PER_REQUEST_COST =",
            quote(fill("{{cost:per_credit}}")),
            ";",
        )}${constant("EXTRACT_NO_CREDITS", "{{text:extract-no-credits}}")}${constant(
            "ADAPTIVE_STEALTH_MODE",
            "{{text:adaptive-stealth-mode}}",
        )}${constant("REQUEST_TIMEOUT", "{{text:request-timeout}}")}${toolIds}`,
    };
}
