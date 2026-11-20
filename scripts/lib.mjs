// Shared by render.mjs, validate.mjs and override.mjs: where things live, how a
// host's plugin is rendered, and how override hashes are computed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const skillsDir = join(root, "skills");
export const platformsDir = join(root, "platforms");
export const distDir = join(root, "dist");
export const sharedTextDir = join(root, "shared", "text");

// Files copied into every host's plugin as they are.
const sharedFiles = { LICENSE: "LICENSE" };
const sharedDirs = { "shared/assets": "assets" };
// In platforms/<host>/, these are inputs to the render or the host's own tooling
// (scripts/validate.mjs, scripts/render.mjs, scripts/package.sh), not files of the plugin.
// Everything else there (manifests, README, …) is copied into dist/<host>/.
const reserved = ["vars.yaml", "overrides.lock", "skills/", "scripts/", "readme/"];
// A plugin host's README.md is rendered from this template, with the host's
// slots from platforms/<host>/readme/.
const readmeTemplate = join(root, "shared", "README.md");
// What's left of one of this tool's tokens ({{name}}, {{skill:x}}, {{text:x}},
// {{< x}}, {{> x}}) after the render, for example in a file type it doesn't
// fill, or with a stray space, capital letter, _ or . the fill regexes don't
// take. A colon is ours only after skill or text, so JSX's style={{ flex: 1 }}
// isn't matched; nor is other tools' {{…}} (Make's {{a.b}}, n8n's {{ $json.x }}),
// which ships as written. scripts/test.mjs lists both sides.
export const leftoverToken = /\{\{\s*(?:[<>]\??\s*[a-z0-9_.-]+|(?:skill|text)\s*:\s*[a-z0-9_.-]+|[a-z_][a-z0-9_-]*)\s*\}\}/i;
// {{vars}} are filled in files with these extensions; others are copied as bytes.
export const textFile = /\.(json|mdx?|mdc|ya?ml|txt|toml|[cm]?[jt]s)$/;

// Errors here are for whoever edited a skill or platform file: print the
// message, not a stack trace.
process.on("uncaughtException", (e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function hosts() {
  return readdirSync(platformsDir).filter((d) => statSync(join(platformsDir, d)).isDirectory()).sort();
}

export function skillNames() {
  return readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md"))).sort();
}

export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && !f.endsWith(".DS_Store"))
    .map((f) => relative(dir, f))
    .sort();
}

function versions() {
  return JSON.parse(readFileSync(join(root, ".release-please-manifest.json"), "utf8"));
}

// shared/vars.yaml: values every host gets.
function sharedVars() {
  const file = join(root, "shared", "vars.yaml");
  if (!existsSync(file)) return {};
  const v = parseYaml(readFileSync(file, "utf8")) ?? {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("shared/vars.yaml must be a list of name: value lines");
  return v;
}

export function vars(host) {
  const v = parseYaml(readFileSync(join(platformsDir, host, "vars.yaml"), "utf8")) ?? {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`platforms/${host}/vars.yaml must be a list of name: value lines`);
  if ("kind" in v && v.kind !== "plugin" && v.kind !== "code") {
    throw new Error(`platforms/${host}/vars.yaml: kind is ${JSON.stringify(v.kind)}; use plugin or code`);
  }
  const version = versions()[`dist/${host}`];
  // A code host may not be released from here (yet), so it needs no
  // release-please entry; it then has no {{version}}.
  if (!version && !isCodeHost(v)) throw new Error(`.release-please-manifest.json has no "dist/${host}" entry`);
  // shared/vars.yaml first, so the host's own values win; {{openapi_url}}: the
  // published API spec, the one {{api:…}} and api: read.
  const values = { ...sharedVars(), ...v, openapi_url: openapiUrl };
  return version ? { ...values, version } : values;
}

// The published API spec, which the {{api:…}} placeholders and render scripts read.
// ZENROWS_OPENAPI names a file to use instead (tests, a spec not published
// yet). The last download is kept in .cache/openapi.json for when the network
// is down.
export const openapiUrl = "https://www.zenrows.com/openapi.json";
const openapiCache = join(root, ".cache", "openapi.json");
export async function openapi() {
  return JSON.parse(await openapiText());
}
async function openapiText() {
  if (process.env.ZENROWS_OPENAPI) return readFileSync(process.env.ZENROWS_OPENAPI, "utf8");
  try {
    const res = await fetch(openapiUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    mkdirSync(dirname(openapiCache), { recursive: true });
    writeFileSync(openapiCache, text);
    return text;
  } catch (e) {
    if (!existsSync(openapiCache)) {
      throw new Error(`couldn't download the API spec from ${openapiUrl} (${e.message}), and there's no copy in .cache/openapi.json yet`);
    }
    console.warn(`⚠️ couldn't download the API spec from ${openapiUrl} (${e.message}); using the copy in .cache/openapi.json`);
    return readFileSync(openapiCache, "utf8");
  }
}

// What the render needs before it starts: the API spec and each host's own
// scripts/render.mjs. The render itself is synchronous, so render and validate
// call this first.
let loadedSpec;
const hostRenderers = {};
export async function prepareRender() {
  for (const host of hosts()) {
    const script = join(platformsDir, host, "scripts", "render.mjs");
    if (existsSync(script)) hostRenderers[host] = (await import(pathToFileURL(script).href)).default;
  }
  const text = await openapiText();
  loadedSpec = { spec: JSON.parse(text), sha256: sha256(text) };
}

// A $ref in the spec, followed to what it points at.
function specRef(spec, node) {
  while (node?.$ref) node = node.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], spec);
  return node;
}

// node with every $ref replaced by a copy of its target, so the result stands
// alone; a $ref that leads back to itself fails, since it can't be inlined.
function inlineRefs(spec, node, seen = []) {
  if (Array.isArray(node)) return node.map((n) => inlineRefs(spec, n, seen));
  if (!node || typeof node !== "object") return node;
  if (node.$ref) {
    if (seen.includes(node.$ref)) throw new Error(`the API spec's ${node.$ref} refers to itself, so it can't be inlined`);
    return inlineRefs(spec, specRef(spec, node), [...seen, node.$ref]);
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, inlineRefs(spec, v, seen)]));
}

// An example value as the spec gives it: example, else the first of examples
// (an OpenAPI Example object's value, or a JSON Schema examples array).
function firstExample(node) {
  if (node?.example !== undefined) return node.example;
  const examples = node?.examples;
  if (Array.isArray(examples)) return examples[0];
  if (examples && typeof examples === "object") return Object.values(examples)[0]?.value;
  return undefined;
}

// The spec's example request for an operation: its query and path parameters'
// examples and its JSON body's, with the parts it has none for left out.
function apiExample(spec, item, op) {
  const out = {};
  const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => specRef(spec, p));
  for (const [part, key] of [["query", "queryParams"], ["path", "pathParams"]]) {
    for (const p of params.filter((p) => p?.in === part)) {
      const value = firstExample(p) ?? firstExample(specRef(spec, p.schema));
      if (value !== undefined) (out[key] ??= {})[p.name] = value;
    }
  }
  const body = op.requestBody?.content?.["application/json"];
  const value = firstExample(body) ?? firstExample(specRef(spec, body?.schema));
  if (value !== undefined) out.body = inlineRefs(spec, value);
  return out;
}

// What {{api:<METHOD> <path> <part> [names]}} renders. For query, path and body:
// a JSON Schema object for that part of the operation (query or path parameters,
// or the JSON body), with each property's schema and description from the spec;
// names (comma-separated) picks some, and without them it's all of the part.
// For summary, description and server: that string from the spec (server: the
// operation's servers, else the path's, else the spec's). For example: the
// example request (see apiExample).
// shared/endpoints.yaml: endpoints that are a slice of one API operation.
function sharedEndpoints() {
  const file = join(root, "shared", "endpoints.yaml");
  return existsSync(file) ? (parseYaml(readFileSync(file, "utf8")) ?? {}) : {};
}

// The endpoints we offer (every one shared/billing.yaml gives a kind other than
// not_offered): an operation shared/endpoints.yaml splits (GET / into fetch and
// extract) as those. Each is { key, id, operation, method, path, name,
// description, server, input, example, security, billing }: key is the shared
// name or the operation, id the shared name or the operationId in snake_case,
// description undefined where the spec has none, input the query, path and body
// schemas it takes, security its key schemes from the spec, and billing its kind
// in shared/billing.yaml.
const httpMethods = ["get", "post", "put", "patch", "delete"];
// shared/billing.yaml as { endpoint: kind }. Every name must be an API operation or
// a shared endpoint, in one kind only, and every API operation must be named,
// itself or through a shared endpoint that splits it.
function sharedBilling(spec, operations, shared) {
  const file = join(root, "shared", "billing.yaml");
  const kinds = existsSync(file) ? (parseYaml(readFileSync(file, "utf8")) ?? {}) : {};
  const byEndpoint = {};
  for (const [kind, names] of Object.entries(kinds)) {
    for (const name of names) {
      if (!operations.includes(name) && !(name in shared)) throw new Error(`shared/billing.yaml: ${kind} names "${name}", which is neither an API operation nor a shared endpoint`);
      if (byEndpoint[name]) throw new Error(`shared/billing.yaml: "${name}" is both ${byEndpoint[name]} and ${kind}`);
      byEndpoint[name] = kind;
    }
  }
  for (const operation of operations) {
    const named = operation in byEndpoint || Object.keys(shared).some((name) => shared[name].operation === operation && name in byEndpoint);
    if (!named) throw new Error(`shared/billing.yaml: the API's "${operation}" is in none of ${Object.keys(kinds).join(", ")}; add it to one`);
  }
  return byEndpoint;
}

// The API operations shared/billing.yaml lists as not_offered.
export function apiNotOffered(spec) {
  const all = Object.entries(spec.paths).flatMap(([path, item]) => httpMethods.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${path}`));
  const billing = sharedBilling(spec, all, sharedEndpoints());
  return all.filter((operation) => billing[operation] === "not_offered");
}

export function apiEndpoints(spec, where) {
  const all = Object.entries(spec.paths).flatMap(([path, item]) => httpMethods.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${path}`));
  const shared = sharedEndpoints();
  const billing = sharedBilling(spec, all, shared);
  return all
    .filter((operation) => billing[operation] !== "not_offered")
    .flatMap((operation) => {
      const [method, path] = operation.split(" ");
      const op = spec.paths[path][method.toLowerCase()];
      const slices = Object.keys(shared).filter((name) => shared[name].operation === operation);
      if (!slices.length && !op.operationId) throw new Error(`${where}: the spec's ${operation} has no operationId to name it by`);
      const named = slices.length ? slices.map((name) => [name, name]) : [[operation, op.operationId.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()]];
      return named.filter(([key]) => billing[key] && billing[key] !== "not_offered").map(([key, id]) => {
        const value = (part) => apiValue(spec, key, part, undefined, where);
        const input = {};
        for (const part of ["query", "path", "body"]) {
          if (part === "body" && !op.requestBody) continue;
          const schema = value(part);
          if (part === "body" || Object.keys(schema.properties ?? {}).length) input[part] = schema;
        }
        return {
          key,
          id,
          operation,
          method,
          path,
          name: value("summary"),
          description: shared[key]?.description || op.description ? value("description") : undefined,
          server: value("server"),
          input,
          example: value("example"),
          // Where the operation takes the key: { header: "X-API-Key", query: "apikey" }, or one of them.
          keyIn: Object.fromEntries((op.security ?? spec.security ?? []).flatMap((s) => Object.keys(s)).map((name) => spec.components?.securitySchemes?.[name]).filter((s) => s?.type === "apiKey").map((s) => [s.in, s.name])),
          billing: billing[key],
        };
      });
    });
}

export function apiValue(spec, operation, part, names, where) {
  // A shared endpoint ("extract") is its operation, with its own query
  // parameters, and its own name and description where it gives them.
  if (!/\s/.test(operation)) {
    const shared = sharedEndpoints()[operation];
    if (!shared) throw new Error(`${where}: shared/endpoints.yaml has no endpoint "${operation}"`);
    const own = `shared/endpoints.yaml ${operation}`;
    const takes = Object.keys(apiValue(spec, shared.operation, "query", undefined, own).properties ?? {});
    const unknown = (shared.parameters ?? []).find((p) => !takes.includes(p));
    if (unknown) throw new Error(`${own}: ${shared.operation} has no query parameter "${unknown}"`);
    if (part === "summary" && shared.name) return shared.name;
    if (part === "description" && shared.description) {
      return shared.description.replace(/\{\{<\s*([a-z0-9-]+)\s*\}\}/g, (_, name) => sharedText(name, own));
    }
    if (part === "query" && shared.parameters) return apiValue(spec, shared.operation, part, names ?? shared.parameters.join(","), where);
    if (part === "example" && shared.parameters) {
      const example = apiValue(spec, shared.operation, part, names, where);
      const query = Object.fromEntries(Object.entries(example.queryParams ?? {}).filter(([k]) => shared.parameters.includes(k)));
      const { queryParams, ...rest } = example;
      return Object.keys(query).length ? { ...rest, queryParams: query } : rest;
    }
    return apiValue(spec, shared.operation, part, names, where);
  }
  const [method, path] = operation.split(/\s+/);
  const item = spec.paths?.[path];
  const op = item?.[method.toLowerCase()];
  if (!op) throw new Error(`${where}: the API has no operation "${operation}"`);
  if (part === "example") {
    if (names) throw new Error(`${where}: {{api:… example}} takes no names`);
    return apiExample(spec, item, op);
  }
  if (part === "responses") {
    const all = Object.fromEntries(
      Object.entries(op.responses ?? {})
        .map(([status, response]) => [status, specRef(spec, response)?.description])
        .filter(([, description]) => description),
    );
    if (!names) return all;
    const picked = names.split(",").map((n) => n.trim()).filter(Boolean);
    for (const status of picked) {
      if (!(status in all)) throw new Error(`${where}: the API spec has no described ${status} response for ${operation}`);
    }
    return Object.fromEntries(picked.map((status) => [status, all[status]]));
  }
  if (["summary", "description", "server"].includes(part)) {
    if (names) throw new Error(`${where}: {{api:… ${part}}} takes no names`);
    const value = part === "server" ? (op.servers ?? item.servers ?? spec.servers)?.[0]?.url : op[part];
    if (!value) throw new Error(`${where}: the API spec has no ${part} for ${operation}`);
    return value;
  }
  let schema;
  if (part === "body") {
    const body = op.requestBody?.content?.["application/json"]?.schema;
    if (!body) throw new Error(`${where}: ${operation} has no JSON body`);
    schema = inlineRefs(spec, body);
  } else {
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => specRef(spec, p)).filter((p) => p?.in === part);
    const required = params.filter((p) => p.required).map((p) => p.name);
    schema = {
      type: "object",
      properties: Object.fromEntries(
        params.map((p) => [p.name, { ...inlineRefs(spec, p.schema ?? {}), ...(p.description ? { description: p.description } : {}) }]),
      ),
      ...(required.length ? { required } : {}),
    };
  }
  if (!names) return schema;
  const picked = names.split(",").map((n) => n.trim()).filter(Boolean);
  for (const name of picked) {
    if (!(name in (schema.properties ?? {}))) throw new Error(`${where}: ${operation} has no ${part} parameter "${name}"`);
  }
  const { required: all = [], ...rest } = schema;
  const required = all.filter((n) => picked.includes(n));
  return {
    ...rest,
    properties: Object.fromEntries(picked.map((n) => [n, schema.properties[n]])),
    ...(required.length ? { required } : {}),
  };
}

// overrides.lock: "<shared path>: <sha256>" per line; # starts a comment.
export function readLock(host) {
  const file = join(platformsDir, host, "overrides.lock");
  if (!existsSync(file)) return {};
  return parseYaml(readFileSync(file, "utf8")) ?? {};
}

// The skills a host ships: the shared skills minus vars.yaml's skip_skills, plus
// the host's own skills (platforms/<host>/skills/<name>/SKILL.md with no shared
// skill of that name). Returns [{ name, own }].
export function hostSkills(host, values = vars(host)) {
  // A code host (kind: code) ships no skills, so a skills/ folder there would be ignored.
  if (isCodeHost(values)) {
    if (listFiles(join(platformsDir, host, "skills")).length) {
      throw new Error(`platforms/${host}/skills/: a code host (kind: code) ships no skills; move these files out of skills/`);
    }
    return [];
  }
  const shared = skillNames();
  const skip = values.skip_skills ?? [];
  for (const name of skip) {
    if (!shared.includes(name)) throw new Error(`platforms/${host}/vars.yaml: skip_skills lists "${name}", which isn't in skills/`);
  }
  const own = listFiles(join(platformsDir, host, "skills"))
    .filter((f) => /^[^/]+\/SKILL\.md$/.test(f))
    .map((f) => f.split("/")[0])
    .filter((name) => !shared.includes(name));
  return [
    ...shared.filter((name) => !skip.includes(name)).map((name) => ({ name, own: false })),
    ...own.map((name) => ({ name, own: true })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

// kind: code in vars.yaml marks a host whose output isn't a plugin but files for
// somewhere else (code for another project, a listing a marketplace reads): it
// ships only its own files, with {{…}} filled in, and no shared skills, LICENSE
// or assets.
export function isCodeHost(values) {
  // vars() has already rejected any other kind, naming the file.
  return values.kind === "code";
}

// A skill's name on a host: skill_prefix + the shared name, unless vars.yaml
// renames it in skill_names (OpenClaw ships scrape-webpage as zenrows-scrape).
export function hostSkillName(values, name) {
  return values.skill_names?.[name] ?? `${values.skill_prefix ?? ""}${name}`;
}

// shared/text/<name>.md: one fact in plain text, used by skills and by code
// hosts alike, so a wording fix reaches both.
export function sharedText(name, where) {
  const file = join(sharedTextDir, `${name}.md`);
  if (!existsSync(file)) throw new Error(`${where}: there's no shared/text/${name}.md`);
  // Trimmed, so a trailing blank line or a CRLF ending doesn't end up in a string.
  const text = readFileSync(file, "utf8").trim();
  if (text.includes("{{")) {
    throw new Error(`shared/text/${name}.md uses {{…}}; a snippet is a plain fact, and the text around it adds what differs per host`);
  }
  return text;
}

// {{name}} is a variable from vars.yaml; {{skill:name}} is that skill's name on
// the host; {{< name}} inlines shared/text/<name>.md, and {{text:name}} inserts it
// as a quoted string literal (JSON), for code. {{api:GET / query url,mode}} is
// that part of an API operation as JSON Schema, or its summary, description,
// server, example or responses (see apiValue), and {{api-sha256}} the sha256 of
// the spec it was read from.
function fill(text, values, where) {
  text = text.replace(/\{\{api:\s*(?:([A-Z]+)\s+(\S+)|([a-z][a-z0-9_-]*))\s+(query|path|body|summary|description|server|example|responses)(?:\s+([\w,.-]+))?\s*\}\}/g, (_, method, path, shared, part, names) =>
    JSON.stringify(apiValue(apiSpecFor(where).spec, shared ?? `${method} ${path}`, part, names, where)),
  );
  text = text.replace(/\{\{api-sha256\}\}/g, () => apiSpecFor(where).sha256);
  text = text.replace(/\{\{<\s*([a-z0-9-]+)\s*\}\}/g, (_, name) => sharedText(name, where));
  return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)(?::([a-z0-9-]+))?\s*\}\}/g, (token, name, arg) => {
    if (name === "skill") {
      if (!values.skills.includes(arg)) {
        const why = !skillNames().includes(arg)
          ? "there's no such skill"
          : isCodeHost(values)
            ? "a code host (kind: code) ships no skills"
            : "this host skips it (skip_skills)";
        throw new Error(`${where}: ${token} names a skill this host doesn't ship: ${why}`);
      }
      return hostSkillName(values, arg);
    }
    if (name === "text" && arg !== undefined) return JSON.stringify(sharedText(arg, where));
    if (arg !== undefined || !(name in values) || typeof values[name] === "object") {
      throw new Error(`${where}: unknown variable ${token}`);
    }
    return String(values[name]);
  });
}

// Renders one host. Returns Map<path under dist/<host>, Buffer>.
function apiSpecFor(where) {
  if (!loadedSpec) throw new Error(`${where}: uses {{api…}}, but the API spec wasn't loaded (call prepareRender() before rendering)`);
  return loadedSpec;
}

// Puts a host's slot files into text: {{> slot}} needs <dir>/<slot>.md; {{>? slot}}
// is optional, and without the file its line (and one blank line after it) goes.
// Records each slot file used in usedSlots.
function fillSlots(text, dir, where, usedSlots) {
  return text
    .replace(/^[ \t]*\{\{>\?\s*([a-z0-9_-]+)\s*\}\}[ \t]*\n(\n)?/gm, (line, slot) => (existsSync(join(dir, `${slot}.md`)) ? line : ""))
    .replace(/\{\{>(\?)?\s*([a-z0-9_-]+)\s*\}\}/g, (_, optional, slot) => {
      const file = join(dir, `${slot}.md`);
      if (!existsSync(file)) {
        if (optional) return "";
        throw new Error(`${where}: slot {{> ${slot}}} has no ${relative(root, file)}`);
      }
      usedSlots.add(relative(root, file));
      return readFileSync(file, "utf8").replace(/\n$/, "");
    });
}

export function renderHost(host) {
  const values = vars(host);
  const skills = hostSkills(host, values);
  values.skills = skills.map((s) => s.name);
  const platform = join(platformsDir, host);
  const out = new Map();
  const usedSlots = new Set();

  for (const { name } of skills) {
    // The host's own copy: a skill only this host has, or a whole-file override.
    const own = join(platform, "skills", name, "SKILL.md");
    const source = existsSync(own) ? own : join(skillsDir, name, "SKILL.md");
    const where = relative(root, source);
    let text = fillSlots(readFileSync(source, "utf8"), join(platform, "skills", name), where, usedSlots);
    text = fill(text, values, where);
    out.set(`skills/${hostSkillName(values, name)}/SKILL.md`, Buffer.from(text));
  }

  for (const file of listFiles(join(platform, "skills"))) {
    const path = relative(root, join(platform, "skills", file));
    if (file.endsWith("/SKILL.md")) continue;
    if (!usedSlots.has(path)) throw new Error(`${path}: no skill this host ships has this slot`);
  }

  if (!isCodeHost(values)) {
    if (existsSync(join(platform, "README.md"))) {
      throw new Error(`platforms/${host}/README.md: a plugin's README comes from shared/README.md; put the host's own text in platforms/${host}/readme/setup.md (and readme/more.md)`);
    }
    const where = relative(root, readmeTemplate);
    out.set("README.md", Buffer.from(fill(fillSlots(readFileSync(readmeTemplate, "utf8"), join(platform, "readme"), where, usedSlots), values, where)));
    for (const file of listFiles(join(platform, "readme"))) {
      const path = relative(root, join(platform, "readme", file));
      if (!usedSlots.has(path)) throw new Error(`${path}: shared/README.md has no slot for it`);
    }
  }

  for (const [from, to] of isCodeHost(values) ? [] : Object.entries(sharedFiles)) out.set(to, readFileSync(join(root, from)));
  for (const [from, to] of isCodeHost(values) ? [] : Object.entries(sharedDirs)) {
    for (const file of listFiles(join(root, from))) out.set(`${to}/${file}`, readFileSync(join(root, from, file)));
  }
  for (const file of listFiles(platform)) {
    if (reserved.some((r) => file === r || file.startsWith(r))) continue;
    // A code host's README documents the integration here; it isn't part of the code.
    if (isCodeHost(values) && file === "README.md") continue;
    out.set(file, renderFile(join(platform, file), values));
  }

  // A host's own scripts/render.mjs builds files from the spec and its vars.yaml
  // (for example a listing generated whole). It gets what the placeholders use
  // and returns { "<path in dist/<host>>": string or Buffer }.
  if (hostRenderers[host]) {
    const where = `platforms/${host}/scripts/render.mjs`;
    const files = hostRenderers[host]({
      values,
      fill: (text) => fill(text, values, where),
      apiEndpoints: () => apiEndpoints(loadedSpec.spec, where),
      apiNotOffered: () => apiNotOffered(loadedSpec.spec),
    });
    for (const [path, content] of Object.entries(files ?? {})) {
      if (out.has(path)) throw new Error(`${where} returns ${path}, which platforms/${host}/ already has`);
      out.set(path, Buffer.isBuffer(content) ? content : Buffer.from(content));
    }
  }

  // A token the render didn't fill (a mistyped one, or in a file type outside
  // textFile) would otherwise ship as it is. Binary files (not valid UTF-8) are skipped.
  for (const [path, buf] of out) {
    const text = buf.toString("utf8");
    const token = Buffer.from(text, "utf8").equals(buf) && (text.match(leftoverToken) ?? text.match(/\{\{\s*api[-:][^\n]*?\}\}/));
    if (token) {
      throw new Error(`${host}: ${path} still has an unrendered ${token[0]}`);
    }
  }
  // release-please rewrites each JSON file it bumps as JSON.stringify(…, null, 2);
  // render them the same way, so a release PR changes only the version.
  for (const path of versionedJson(host)) {
    if (out.has(path)) out.set(path, Buffer.from(`${JSON.stringify(JSON.parse(out.get(path).toString("utf8")), null, 2)}\n`));
  }
  return out;
}

// Marketplace catalogs at the top of the repo (for example Copilot's
// .github/plugin/marketplace.json), which point a host at ./dist/<host>. They are
// normal files, not rendered; release-please bumps their version, so they're
// the extra-files with a leading "/" in release-please-config.json.
// Returns [{ host, file }] with file relative to the repo root.
export function catalogs() {
  const config = releaseConfig();
  const found = new Map();
  for (const [pkg, settings] of Object.entries(config.packages ?? {})) {
    const host = pkg.replace(/^dist\//, "");
    for (const extra of settings["extra-files"] ?? []) {
      const path = typeof extra === "string" ? extra : extra.path;
      if (path.startsWith("/")) found.set(`${host} ${path}`, { host, file: path.slice(1) });
    }
  }
  return [...found.values()];
}

// The JSON files release-please bumps inside dist/<host> (its extra-files without
// a leading "/"), as paths in dist/<host>.
function versionedJson(host) {
  return (releaseConfig().packages?.[`dist/${host}`]?.["extra-files"] ?? [])
    .map((extra) => (typeof extra === "string" ? extra : extra.path))
    .filter((path) => !path.startsWith("/") && path.endsWith(".json"));
}
const releaseConfig = () => JSON.parse(readFileSync(join(root, "release-please-config.json"), "utf8"));

// A host with mirror: <owner/repo> in vars.yaml is also published to that repo,
// whose root is dist/<host>/ plus the host's marketplace catalogs, if it has
// any (see catalogs()), at the same paths, listing only this host with source
// "./" (the mirror's root), and a banner under README.md's title pointing back here.
// The banner names the release tag, or for a sync with no tag, the commit.
// Reads the committed files, which render --check and validate keep current.
// Returns Map<path, Buffer>.
export function renderMirror(host, { tag, sha } = {}) {
  if (!tag && !sha) throw new Error("renderMirror needs the release tag or the source commit");
  const values = vars(host);
  if (!values.mirror) throw new Error(`platforms/${host}/vars.yaml has no mirror: <owner/repo>`);
  const out = new Map();
  for (const file of listFiles(join(distDir, host))) out.set(file, readFileSync(join(distDir, host, file)));
  for (const { file } of catalogs().filter((c) => c.host === host)) {
    const catalog = JSON.parse(readFileSync(join(root, file), "utf8"));
    catalog.plugins = (catalog.plugins ?? [])
      .filter((p) => p.source === `./dist/${host}`)
      .map((p) => ({ ...p, source: "./" }));
    out.set(file, Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`));
  }
  if (out.has("README.md")) {
    const banner =
      `> Generated from [ZenRows/zenrows-integrations](https://github.com/ZenRows/zenrows-integrations/tree/main/dist/${host}), ` +
      `${tag ? `released as ${tag}` : `synced from main at ${sha.slice(0, 7)}`}. ` +
      `Open issues and pull requests there; changes made here are overwritten.`;
    const readme = out.get("README.md").toString("utf8");
    const title = readme.match(/^# .*\n/);
    const at = title ? title[0].length : 0;
    out.set("README.md", Buffer.from(`${readme.slice(0, at)}${title ? "\n" : ""}${banner}\n\n${readme.slice(at).replace(/^\n/, "")}`));
  }
  return out;
}

function renderFile(path, values) {
  if (!textFile.test(path)) return readFileSync(path);
  return Buffer.from(fill(readFileSync(path, "utf8"), values, relative(root, path)));
}
