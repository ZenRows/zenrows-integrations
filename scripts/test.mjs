// npm test: the mistakes the render and validate must catch. Each case copies
// the repo to a temporary folder, makes one change (a throwaway code host, a
// snippet, …), runs npm run render and npm run validate there, and checks the
// first failure, or that both pass. Add a case whenever a new rule is added.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { openapi, root } from "./lib.mjs";

// Every tracked file (-z keeps non-ASCII names as they are), so catalogs at the
// top of the repo (.claude-plugin/, …) come too. One deleted locally is left out.
const copied = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((path) => path && existsSync(join(root, path)));

// A code host that passes as it is; cases add or remove files from it.
const piece = {
  "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\n",
  "platforms/piece/README.md": "# Piece\n",
  "platforms/piece/src/index.ts": "export const host = \"{{host_full}}\";\n",
};

// Runs render then validate in a copy of the repo with `files` written over it
// (null deletes). Returns { ok, out, dist }: out is the failing step's output,
// dist(path) reads a rendered file.
// The API spec validate reads: the last download if there is one, so the tests
// don't need the network; a case can name its own file in env.ZENROWS_OPENAPI.
const cachedSpec = join(root, ".cache", "openapi.json");
function run(files, env = {}, reads = []) {
  const dir = mkdtempSync(join(tmpdir(), "zenrows-integrations-test-"));
  try {
    for (const path of copied) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      cpSync(join(root, path), join(dir, path));
    }
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
    mkdirSync(join(root, ".cache"), { recursive: true });
    symlinkSync(join(root, ".cache"), join(dir, ".cache"));
    for (const [path, content] of Object.entries(files)) {
      if (content === null) rmSync(join(dir, path), { recursive: true, force: true });
      else {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
    }
    let out = "";
    for (const script of ["render", "validate"]) {
      const r = spawnSync("node", [join("scripts", `${script}.mjs`)], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...(existsSync(cachedSpec) ? { ZENROWS_OPENAPI: cachedSpec } : {}), ...env },
      });
      if (r.status !== 0) return { ok: false, out: `${r.stdout}${r.stderr}` };
      out += `${r.stdout}${r.stderr}`;
    }
    const outs = [...Object.keys(files).filter((p) => p.startsWith("platforms/")).map((p) => p.replace(/^platforms\//, "dist/")), ...reads];
    const rendered = new Map(outs.map((out) => [out, existsSync(join(dir, out)) ? readFileSync(join(dir, out), "utf8") : undefined]));
    return { ok: true, out, dist: (path) => rendered.get(path) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const passes = (files, env) => () => {
  const r = run(files, env);
  assert.ok(r.ok, r.out);
};
// Passes, with a warning that says message.
const warns = (files, message, env) => () => {
  const r = run(files, env);
  assert.ok(r.ok, r.out);
  assert.ok(r.out.includes(message), `expected the warning "${message}" in:\n${r.out}`);
};
const fails = (files, message, env) => () => {
  const r = run(files, env);
  assert.ok(!r.ok, "expected a failure, but render and validate passed");
  assert.ok(r.out.includes(message), `expected "${message}" in:\n${r.out}`);
};

test("the repo as it is passes", passes({}));
test("a code host passes", passes(piece));

// The guard on rendered files, both sides: every form of this tool's tokens
// must be caught (here in a .tsx, which the render doesn't fill, so each one
// is a leftover), and other tools' {{…}} must ship as written. Known limit: a
// mistyped keyword ({{txet:cost}}) looks like another tool's {{a:b}} and ships.
const ours = [
  "{{host_full}}", "{{ host_full }}", "{{Host_full}}", "{{host-full}}", "{{api_v2}}",
  "{{skill:batch}}", "{{skill: batch}}", "{{Skill:batch}}", "{{skill:scrape_webpage}}",
  "{{text:cost}}", "{{text: cost}}", "{{text:cost.md}}", "{{text:cost_credits}}",
  "{{< cost}}", "{{ < cost}}", "{{<cost}}", "{{< COST}}", "{{< cost.md}}",
  "{{> connect}}", "{{>? connect}}", "{{> connect.md}}",
];
test("every form of this tool's tokens is caught", () => {
  for (const token of ours) {
    fails({ ...piece, "platforms/piece/src/view.tsx": `export const a = ${token};\n` }, `src/view.tsx still has an unrendered ${token}`)();
  }
});
test("a {{…}} in a file type the render doesn't fill fails", fails({ ...piece, "platforms/piece/setup.py": "name = \"{{host_full}}\"\n" }, "setup.py still has an unrendered {{host_full}}"));
test("an MDX page is filled", () => {
  const r = run({ ...piece, "platforms/piece/docs/page.mdx": "# {{host_full}}\n\n<Table content={[{ name: 'x' }]} />\n" }, {}, ["dist/piece/docs/page.mdx"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/docs/page.mdx"), "# Piece\n\n<Table content={[{ name: 'x' }]} />\n");
});
test("a mistyped snippet token fails on the way through the render", fails({
  ...piece,
  "shared/text/cost.md": "A request with js_render costs 5 credits.\n",
  "platforms/piece/src/index.ts": "export const cost = {{ < cost}};\n",
}, "src/index.ts still has an unrendered {{ < cost}}"));
test("a variable with a digit in its name is filled", () => {
  const r = run({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\napi_v2: two\n", "platforms/piece/src/index.ts": "export const v = \"{{api_v2}}\";\n" });
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/index.ts"), "export const v = \"two\";\n");
});
test("an unknown variable fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const a = \"{{hots_full}}\";\n" }, "unknown variable {{hots_full}}"));

test("a code host with no README fails", fails({ ...piece, "platforms/piece/README.md": null }, "a code host needs platforms/piece/README.md"));
test("a code host with a skills/ folder fails", fails({ ...piece, "platforms/piece/skills/scrape/SKILL.md": "x\n" }, "a code host (kind: code) ships no skills"));
test("a skill reference in a code host fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const s = \"{{skill:batch}}\";\n" }, "a code host (kind: code) ships no skills"));
test("an unreleased code host needs no upload:", passes(piece));
test("an unreleased code host with an upload: to and url fails", fails({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\nupload:\n  to: npm\n  url: https://www.npmjs.com/\n" }, "has no release, so an upload reminder can never fire"));
test("a released host without upload: fails", fails({
  "platforms/copilot/vars.yaml": readFileSync(join(root, "platforms/copilot/vars.yaml"), "utf8").replace(/^upload:.*\n/m, ""),
}, "copilot: vars.yaml has no upload:"));
test("an upload: link Slack can't show fails", () => {
  const vars = readFileSync(join(root, "platforms/copilot/vars.yaml"), "utf8").replace(/^upload:.*\n/m, "");
  for (const upload of ['upload:\n  to: X\n  url: "https://a b"\n', 'upload:\n  to: X\n  url: "https://a|b"\n', 'upload:\n  to: "A | B"\n  url: https://example.com\n']) {
    fails({ "platforms/copilot/vars.yaml": vars + upload }, "copilot: vars.yaml upload: must be false")();
  }
});
test("an unknown kind fails", () => {
  fails({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind: Code\n" }, 'platforms/piece/vars.yaml: kind is "Code"')();
  fails({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind: [code]\n" }, 'platforms/piece/vars.yaml: kind is ["code"]')();
  fails({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind:\n" }, "platforms/piece/vars.yaml: kind is null")();
});
test("a vars.yaml that isn't name: value lines fails", fails({ ...piece, "platforms/piece/vars.yaml": "- host_full: Piece\n" }, "platforms/piece/vars.yaml must be a list of name: value lines"));

// The test operations sit on /stub paths on top of the published spec, so hosts
// that take their real parameters from it still render.
const published = await openapi();

// {{api:…}} renders part of an operation from the spec as JSON Schema; {{api-sha256}} the spec's hash.
const tokenSpecText = JSON.stringify({
  ...published,
  paths: {
    ...published.paths,
    "/stub": {
      parameters: [
        { name: "url", in: "query", required: true, description: "The page.", schema: { type: "string", format: "uri" }, example: "https://example.com/" },
        { $ref: "#/components/parameters/stubMode" },
      ],
      get: {
        operationId: "fetchPage",
        summary: "Fetch a page",
        description: "Fetches a stub page.",
        responses: { 200: { description: "The page." }, 404: { $ref: "#/components/responses/StubMissing" }, 500: {} },
      },
    },
    "/stub/{job_id}": {
      servers: [{ url: "https://async.example.com/v1" }],
      get: { operationId: "getJob", summary: "Read a job", parameters: [{ name: "job_id", in: "path", required: true, schema: { type: "string", examples: ["J1"] } }] },
    },
    "/stub-site": { servers: [{ url: "https://zenrows.com" }], get: { operationId: "askSite", summary: "The website's own endpoint" } },
    "/stub-jobs": {
      post: {
        operationId: "createJob",
        summary: "Create a job",
        description: "Sends every URL at once.",
        servers: [{ url: "https://jobs.example.com/v1" }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/StubJob" }, examples: { two: { value: { urls: ["https://a.example/"] } } } } } },
      },
    },
  },
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    ...published.components,
    parameters: { ...published.components?.parameters, stubMode: { name: "mode", in: "query", schema: { type: "string", enum: ["auto"] } } },
    responses: { ...published.components?.responses, StubMissing: { description: "No such page." } },
    schemas: {
      ...published.components?.schemas,
      StubJob: { type: "object", properties: { urls: { type: "array", items: { $ref: "#/components/schemas/StubUrl" } } } },
      StubUrl: { type: "string" },
    },
  },
});
// shared/billing.yaml must place every API operation, so the cases' stub operations go
// in it too: not_offered unless a case gives them a kind.
const stubOperations = ["GET /stub", "GET /stub/{job_id}", "POST /stub-jobs"];
// covered: stub operations a case places through shared endpoints that split them.
const billingWith = (kinds = {}, covered = []) => {
  const billing = parseYaml(readFileSync(join(root, "shared/billing.yaml"), "utf8"));
  for (const [kind, names] of Object.entries(kinds)) billing[kind] = [...(billing[kind] ?? []), ...names];
  const placed = [...Object.values(kinds).flat(), ...covered];
  billing.not_offered = [...billing.not_offered, ...stubOperations.filter((op) => !placed.includes(op))];
  return JSON.stringify(billing);
};
const usesToken = (token) => ({ ...piece, "openapi-tokens.json": tokenSpecText, "shared/billing.yaml": billingWith(), "platforms/piece/src/index.ts": `export const p = ${token};\n` });
const tokenSpec = { ZENROWS_OPENAPI: "openapi-tokens.json" };
const rendersTo = (token, expected) => () => {
  const r = run(usesToken(token), tokenSpec, ["dist/piece/src/index.ts"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/index.ts"), `export const p = ${expected};\n`);
};
test("{{api:…}} renders the query parameters it names", rendersTo("{{api:GET /stub query url}}", '{"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The page."}},"required":["url"]}'));
test("{{api:…}} without names renders the whole part, $refs resolved", rendersTo("{{api:GET /stub query}}", '{"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The page."},"mode":{"type":"string","enum":["auto"]}},"required":["url"]}'));
test("{{api:…}} renders path parameters", rendersTo("{{api:GET /stub/{job_id} path}}", '{"type":"object","properties":{"job_id":{"type":"string","examples":["J1"]}},"required":["job_id"]}'));
test("{{api:…}} renders a JSON body with its $refs inlined", rendersTo("{{api:POST /stub-jobs body}}", '{"type":"object","properties":{"urls":{"type":"array","items":{"type":"string"}}}}'));
test("{{api-sha256}} is the sha256 of the spec", rendersTo('"{{api-sha256}}"', JSON.stringify(createHash("sha256").update(tokenSpecText).digest("hex"))));
test("{{api:…}} for an operation the API doesn't have fails", fails(usesToken("{{api:GET /nope query}}"), 'the API has no operation "GET /nope"', tokenSpec));
test("{{api:…}} for a parameter the operation doesn't have fails", fails(usesToken("{{api:GET /stub query url,page}}"), 'GET /stub has no query parameter "page"', tokenSpec));
test("{{api:… summary}} and {{api:… description}} render the operation's text", rendersTo("[{{api:POST /stub-jobs summary}}, {{api:POST /stub-jobs description}}]", '["Create a job", "Sends every URL at once."]'));
test("{{api:… server}} takes the operation's server, then the path's, then the spec's", rendersTo("[{{api:POST /stub-jobs server}}, {{api:GET /stub/{job_id} server}}, {{api:GET /stub server}}]", '["https://jobs.example.com/v1", "https://async.example.com/v1", "https://api.example.com/v1"]'));
test("{{api:… description}} for an operation without one fails", fails(usesToken("{{api:GET /stub/{job_id} description}}"), "the API spec has no description for GET /stub/{job_id}", tokenSpec));
test("{{api:… responses}} renders each described response's description, $refs followed", rendersTo("{{api:GET /stub responses}}", '{"200":"The page.","404":"No such page."}'));
test("{{api:… responses}} renders only the statuses it names", rendersTo("{{api:GET /stub responses 404}}", '{"404":"No such page."}'));
test("{{api:… responses}} naming a status the spec doesn't describe fails", fails(usesToken("{{api:GET /stub responses 500}}"), "the API spec has no described 500 response for GET /stub", tokenSpec));
// shared/endpoints.yaml: an endpoint that is a slice of one operation, for every host.
// The repo's own shared endpoints stay (o11 uses them); the case adds one.
const sliced = (yaml, token) => ({ ...usesToken(token), "shared/endpoints.yaml": readFileSync(join(root, "shared/endpoints.yaml"), "utf8") + yaml });
test("a shared endpoint renders its slice, name and the spec's description", () => {
  const r = run(sliced("slice:\n  operation: POST /stub-jobs\n  name: Slice\n", "[{{api:slice summary}}, {{api:slice description}}, {{api:slice server}}]"), tokenSpec, ["dist/piece/src/index.ts"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/index.ts"), 'export const p = ["Slice", "Sends every URL at once.", "https://jobs.example.com/v1"];\n');
});
test("a shared endpoint's query is only its parameters", () => {
  const r = run(sliced("slice:\n  operation: GET /stub\n  parameters: [url]\n", "{{api:slice query}}"), tokenSpec, ["dist/piece/src/index.ts"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/index.ts"), 'export const p = {"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The page."}},"required":["url"]};\n');
});
test("a shared endpoint with a parameter its operation doesn't take fails", fails(sliced("slice:\n  operation: GET /stub\n  parameters: [url, page]\n", "{{api:slice query}}"), 'shared/endpoints.yaml slice: GET /stub has no query parameter "page"', tokenSpec));
test("a placeholder naming no shared endpoint fails", fails(usesToken("{{api:nothing query}}"), 'shared/endpoints.yaml has no endpoint "nothing"', tokenSpec));
// shared/vars.yaml: values every host gets, under its own.
test("a shared variable reaches every host, and a host can override it", () => {
  const sharedVars = readFileSync(join(root, "shared/vars.yaml"), "utf8").replace(/^contact_email: .*$/m, "contact_email: team@example.com");
  const files = { ...piece, "shared/vars.yaml": sharedVars, "platforms/piece/src/index.ts": 'export const c = "{{contact_email}}";\n' };
  const shared = run(files, {}, ["dist/piece/src/index.ts"]);
  assert.ok(shared.ok, shared.out);
  assert.equal(shared.dist("dist/piece/src/index.ts"), 'export const c = "team@example.com";\n');
  const own = run({ ...files, "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\ncontact_email: piece@example.com\n" }, {}, ["dist/piece/src/index.ts"]);
  assert.ok(own.ok, own.out);
  assert.equal(own.dist("dist/piece/src/index.ts"), 'export const c = "piece@example.com";\n');
});
test("{{api:… example}} builds the example request from the spec's parameter and body examples", rendersTo("[{{api:GET /stub example}}, {{api:GET /stub/{job_id} example}}, {{api:POST /stub-jobs example}}]", '[{"queryParams":{"url":"https://example.com/"}}, {"pathParams":{"job_id":"J1"}}, {"body":{"urls":["https://a.example/"]}}]'));

// A host's scripts/render.mjs builds files from the spec and its vars.yaml.
const renders = (script, extra = {}) => ({
  ...piece,
  "openapi-tokens.json": tokenSpecText,
  "shared/billing.yaml": billingWith(),
  "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\nlisting_name: Piece listing\n",
  "platforms/piece/scripts/render.mjs": script,
  ...extra,
});
const generator = `export default ({ values, apiEndpoints }) => ({
  "listing.json": JSON.stringify({ name: values.listing_name, required: apiEndpoints().find((e) => e.id === "fetch").input.query.required }) + "\\n",
});
`;
test("a host's render script's files ship", () => {
  const r = run(renders(generator), tokenSpec, ["dist/piece/listing.json"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/listing.json"), '{"name":"Piece listing","required":["url"]}\n');
});
test("a host's render script that throws fails the render", fails(renders('export default () => { throw new Error("no fixture for batch_get"); };\n'), "no fixture for batch_get", tokenSpec));
test("a host's render script returning a file the host already has fails", fails(renders('export default () => ({ "src/index.ts": "x" });\n'), "platforms/piece/scripts/render.mjs returns src/index.ts, which platforms/piece/ already has", tokenSpec));
// apiEndpoints lists the endpoints shared/billing.yaml offers, with their kind. Only
// the stub operations are looked at: the published spec's own are the real hosts'.
const offered = (kinds, extra = {}, covered = []) =>
  renders('export default ({ apiEndpoints }) => ({ "offered.json": JSON.stringify(apiEndpoints().filter((e) => e.path.startsWith("/stub")).map((e) => [e.id, e.billing])) });\n', { "shared/billing.yaml": billingWith(kinds, covered), ...extra });
test("apiEndpoints lists the offered endpoints with their billing kind", () => {
  const r = run(offered({ per_credit: ["GET /stub"], free: ["POST /stub-jobs"] }), tokenSpec, ["dist/piece/offered.json"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/offered.json"), '[["fetch_page","per_credit"],["create_job","free"]]');
});
test("apiEndpoints lists a shared endpoint instead of the operation it splits", () => {
  const endpoints = readFileSync(join(root, "shared/endpoints.yaml"), "utf8") + "a:\n  operation: GET /stub\n  parameters: [url]\nb:\n  operation: GET /stub\n  parameters: [mode]\n";
  const r = run(offered({ free: ["a", "b"] }, { "shared/endpoints.yaml": endpoints }, ["GET /stub"]), tokenSpec, ["dist/piece/offered.json"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/offered.json"), '[["a","free"],["b","free"]]');
});
test("an API operation shared/billing.yaml doesn't place fails", () => {
  const billing = parseYaml(billingWith());
  billing.not_offered = billing.not_offered.filter((op) => op !== "POST /stub-jobs");
  fails(renders('export default ({ apiEndpoints }) => ({ "x.json": JSON.stringify(apiEndpoints().length) });\n', { "shared/billing.yaml": JSON.stringify(billing) }), 'shared/billing.yaml: the API\'s "POST /stub-jobs" is in none of', tokenSpec)();
});
test("shared/billing.yaml naming one of the website's own endpoints fails", fails(offered({ not_offered: ["GET /stub-site"] }), 'shared/billing.yaml: not_offered names "GET /stub-site", which is neither an API operation nor a shared endpoint', tokenSpec));
test("shared/billing.yaml naming an endpoint that doesn't exist fails", fails(offered({ free: ["GET /nope"] }), 'shared/billing.yaml: free names "GET /nope", which is neither an API operation nor a shared endpoint', tokenSpec));
test("shared/billing.yaml with an endpoint in two kinds fails", fails(offered({ free: ["GET /stub"], per_credit: ["GET /stub"] }), 'shared/billing.yaml: "GET /stub" is both', tokenSpec));
test("apiEndpoints says where each endpoint takes the key", () => {
  const spec = JSON.parse(tokenSpecText);
  spec.paths["/stub-jobs"].post.security = [{ apiKeyHeader: [] }, { apiKeyQuery: [] }];
  const keys = run(renders('export default ({ apiEndpoints }) => ({ "keys.json": JSON.stringify(apiEndpoints().filter((e) => e.path.startsWith("/stub")).map((e) => e.keyIn)) });\n', { "shared/billing.yaml": billingWith({ free: ["GET /stub", "POST /stub-jobs"] }), "openapi-tokens.json": JSON.stringify(spec) }), tokenSpec, ["dist/piece/keys.json"]);
  assert.ok(keys.ok, keys.out);
  assert.equal(keys.dist("dist/piece/keys.json"), '[{"query":"apikey"},{"header":"X-API-Key","query":"apikey"}]');
});
test("apiNotOffered lists what shared/billing.yaml doesn't offer", () => {
  const r = run(renders('export default ({ apiNotOffered }) => ({ "not.json": JSON.stringify(apiNotOffered().filter((op) => op.includes("/stub"))) });\n'), tokenSpec, ["dist/piece/not.json"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/not.json"), '["GET /stub","GET /stub/{job_id}","POST /stub-jobs"]');
});
// Activepieces writes one action per offered endpoint (platforms/activepieces/scripts/render.mjs).
// The stub /stub-types operation has one parameter of each type.
const typesSpec = JSON.parse(tokenSpecText);
// o11 lists every offered endpoint too, and its schema needs a description.
typesSpec.paths["/stub/{job_id}"].get.description = "Reads a job.\n\nThe rest is for the API docs.";
typesSpec.paths["/stub-types"] = {
  get: {
    operationId: "getTypes",
    summary: "Read the types",
    description: "Reads the types.",
    responses: { 200: { content: { "application/json": {}, "application/pdf": {} } } },
    security: [{ apiKeyHeader: [] }],
    parameters: [
      { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
      { name: "download", in: "query", schema: { type: "boolean" } },
      { name: "status", in: "query", schema: { type: "string", enum: ["all", "failed"] } },
      { name: "filter", in: "query", schema: { type: "object" } },
      { name: "cursor", in: "query", schema: { type: "string" } },
      { name: "tags", in: "query", schema: { type: "array", items: { type: "string" } } },
      { name: "ids", in: "query", schema: { type: "array", items: { type: "integer" } } },
      { name: "note", in: "query", schema: { type: "string", description: "One line,\nwrapped.\n- kept: a list item" } },
    ],
  },
};
typesSpec.paths["/stub-lines/{job_id}"] = {
  get: { operationId: "getLines", summary: "Read the lines", description: "Reads the lines.", responses: { 200: { content: { "application/x-ndjson": {} } } }, security: [{ apiKeyHeader: [] }], parameters: [{ name: "job_id", in: "path", required: true, schema: { type: "string" } }] },
  post: { operationId: "stopLines", summary: "Stop the lines", description: "Stops the lines.", responses: { 200: { content: { "application/json": {} } } }, security: [{ apiKeyHeader: [] }], parameters: [{ name: "job_id", in: "path", required: true, schema: { type: "string" } }] },
};
const actionFile = (name) => `dist/activepieces/src/lib/actions/${name}.ts`;
const actionFiles = ["generated", "get-job", "create-job", "get-types", "get-lines", "stop-lines", "fetch-page", "fetch", "extract"].map(actionFile);
// shared/actions.yaml with no wording by default, so the stub endpoints read the
// spec; and Activepieces' vars.yaml with its own omit and classification replaced.
const apVars = (own = "\n", wording = "") => ({
  "shared/actions.yaml": wording,
  "platforms/activepieces/vars.yaml": readFileSync(join(root, "platforms/activepieces/vars.yaml"), "utf8").replace(/\n# The wording of the generated actions[\s\S]*$/, own),
});
const typesBilling = (kinds) => {
  const billing = parseYaml(billingWith(kinds));
  for (const op of ["GET /stub-types", "GET /stub-lines/{job_id}", "POST /stub-lines/{job_id}"]) {
    if (!Object.values(kinds).flat().includes(op)) billing.not_offered.push(op);
  }
  return { "openapi-tokens.json": JSON.stringify(typesSpec), "shared/billing.yaml": JSON.stringify(billing) };
};
const actions = (kinds, own, wording) => run({ ...typesBilling(kinds), ...apVars(own, wording) }, tokenSpec, actionFiles);
test("Activepieces gets an action per offered endpoint, and none for the rest", () => {
  const r = actions({ free: ["GET /stub/{job_id}", "POST /stub-jobs"] });
  assert.ok(r.ok, r.out);
  const list = r.dist(actionFile("generated"));
  assert.ok(list.includes("import { getJobAction } from './get-job';\nimport { createJobAction } from './create-job';\n"), list);
  assert.ok(list.includes("getJobAction, createJobAction"), list);
  const job = r.dist(actionFile("get-job"));
  const create = r.dist(actionFile("create-job"));
  assert.ok(job.includes("import { createAction, Property } from '@activepieces/pieces-framework';"), job);
  assert.ok(job.includes('export const getJobAction = createAction({\n  auth: zenrowsAuth,\n  name: "get_job",\n  classification: "READ",\n  displayName: "Read A Job",'), job);
  assert.ok(job.includes("  audience: 'both',\n  aiMetadata: {\n    description: \"Reads a job. This call uses no credits.\",\n    idempotent: true,\n  },\n"), "with no shared wording, the agent reads the spec's description, then the cost");
  assert.ok(job.includes('job_id: Property.ShortText({ displayName: "Job ID", required: true }),'), job);
  assert.ok(job.includes('  description: "Reads a job.",\n'), "the description is the spec's first paragraph");
  assert.ok(job.includes("async run({ auth, propsValue, files })") && job.includes("values: propsValue, files });"), job);
  assert.ok(job.includes('operation: {"method":"GET","server":"https://async.example.com/v1","path":"/stub/{job_id}","key":"query"}'), job);
  assert.ok(create.includes('urls: Property.Array({ displayName: "URLs", required: false }),'), create);
  assert.ok(create.includes('classification: "WRITE",') && create.includes("idempotent: false,"), "a POST writes, and a retry isn't safe");
  assert.ok(create.includes('operation: {"method":"POST","server":"https://jobs.example.com/v1","path":"/stub-jobs","key":"query","body":["urls"]}'), create);
  assert.equal(r.dist(actionFile("fetch-page")), undefined, "GET /stub isn't offered, so it has no action");
  assert.ok(!r.dist(actionFile("fetch")) && !list.includes("fetchAction"), "Fetch is hand-written (Scrape URL)");
  assert.ok(r.dist(actionFile("extract")).includes('name: "extract",'), "Extract, the shared slice of GET /, is generated");
});
test("Activepieces maps each parameter type to its prop, and sends the key in X-API-Key where it can", () => {
  const r = actions({ free: ["GET /stub-types"] });
  assert.ok(r.ok, r.out);
  const ts = r.dist(actionFile("get-types"));
  for (const line of [
    'limit: Property.Number({ displayName: "Limit", required: false, defaultValue: 10 }),',
    'download: Property.Checkbox({ displayName: "Download", required: false }),',
    'status: Property.StaticDropdown({ displayName: "Status", required: false, options: { disabled: false, options: [{ label: "All", value: "all" }, { label: "Failed", value: "failed" }] } }),',
    'tags: Property.Array({ displayName: "Tags", required: false }),',
    'ids: Property.Json({ displayName: "IDs", required: false }),',
    'note: Property.ShortText({ displayName: "Note", description: "One line, wrapped.\\n- kept: a list item", required: false }),',
    'filter: Property.Json({ displayName: "Filter", required: false }),',
    'cursor: Property.ShortText({ displayName: "Cursor", required: false }),',
    '"path":"/stub-types","key":"header","binary":true,"query":["limit","download","status","filter","cursor","tags","ids","note"]}',
  ]) assert.ok(ts.includes(line), `expected ${line} in:\n${ts}`);
});
test("Activepieces reads NDJSON as a list, and a stop is destructive", () => {
  const r = actions({ free: ["GET /stub-lines/{job_id}", "POST /stub-lines/{job_id}"] });
  assert.ok(r.ok, r.out);
  const lines = r.dist(actionFile("get-lines"));
  assert.ok(lines.includes('"path":"/stub-lines/{job_id}","key":"header","lines":true}') && !lines.includes('"binary"'), lines);
  const stop = r.dist(actionFile("stop-lines"));
  assert.ok(stop.includes('classification: "DESTRUCTIVE",') && stop.includes("idempotent: false,"), stop);
});
const stubWording = `action_props:\n  job_id: "The job, from Create Job."\nactions:\n  get_job:\n    name: "Get Job"\n    description: "Read one job."\n    ai: "Reads a job by its ID. Safe to retry."\n  create_job:\n    props:\n      urls: "The URLs to scrape."\n`;
test("shared/actions.yaml gives an action its wording, and vars.yaml its classification", () => {
  const r = actions({ free: ["GET /stub/{job_id}", "POST /stub-jobs"] }, `\nclassification:\n  get_job: SEARCH\n`, stubWording);
  assert.ok(r.ok, r.out);
  const job = r.dist(actionFile("get-job"));
  for (const line of ['classification: "SEARCH",', 'displayName: "Get Job",', 'description: "Read one job.",', 'description: "Reads a job by its ID. Safe to retry. This call uses no credits.",', 'job_id: Property.ShortText({ displayName: "Job ID", description: "The job, from Create Job.", required: true }),']) {
    assert.ok(job.includes(line), `expected ${line} in:\n${job}`);
  }
  assert.ok(r.dist(actionFile("create-job")).includes('urls: Property.Array({ displayName: "URLs", description: "The URLs to scrape.", required: false }),'));
});
test("vars.yaml's omit leaves an optional field out of the form and the request", () => {
  const r = actions({ free: ["GET /stub-types"] }, `\nomit:\n  get_types: [download, filter]\n`);
  assert.ok(r.ok, r.out);
  const ts = r.dist(actionFile("get-types"));
  assert.ok(!ts.includes("download:") && !ts.includes("filter:"), ts);
  assert.ok(ts.includes('"query":["limit","status","cursor","tags","ids","note"]}'), ts);
});
test("omitting a required field fails the Activepieces render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(`\nomit:\n  get_job: [job_id]\n`),
}, 'platforms/activepieces/scripts/render.mjs: vars.yaml omit.get_job drops "job_id", which the API spec has as required in GET /stub/{job_id}', tokenSpec));
test("shared wording for a field an endpoint doesn't take fails the render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(undefined, `actions:\n  get_job:\n    props:\n      nope: "x"\n`),
}, 'shared/actions.yaml: actions.get_job.props describes "nope", but the API spec takes no "nope" in GET /stub/{job_id}', tokenSpec));
test("shared wording for an endpoint we don't offer fails the render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(undefined, `actions:\n  create_job:\n    name: "Create Job"\n`),
}, "shared/actions.yaml: actions.create_job is for no endpoint we offer", tokenSpec));
test("Mastra's generated tools read the same shared wording as Activepieces' actions", () => {
  const tool = "dist/mastra/integrations/zenrows/src/generated/get-job.ts";
  const docs = "dist/mastra/docs/src/content/en/integrations/tools/zenrows.mdx";
  const r = run({ ...typesBilling({ free: ["GET /stub/{job_id}", "POST /stub-jobs"] }), ...apVars(undefined, stubWording) }, tokenSpec, [tool, docs, actionFile("get-job")]);
  assert.ok(r.ok, r.out);
  assert.match(r.dist(tool), /description: 'Reads a job by its ID\. Safe to retry\. This call uses no credits\.',/, "the ai text, then the cost from its kind");
  assert.match(r.dist(tool), /job_id: z\.string\(\)\.describe\('The job, from Create Job\.'\)/);
  assert.match(r.dist(docs), /\| `zenrows-get-job` \| Read one job\. \| Free \|/);
  assert.ok(r.dist(actionFile("get-job")).includes('description: "Reads a job by its ID. Safe to retry. This call uses no credits.",'));
});
test("both hosts add what a call costs from its kind in shared/billing.yaml", () => {
  const tool = "dist/mastra/integrations/zenrows/src/generated/create-job.ts";
  const r = run({ ...typesBilling({ after_run: ["POST /stub-jobs"] }), ...apVars(undefined, `actions:\n  create_job:\n    ai: "Creates a job."\n`) }, tokenSpec, [tool, actionFile("create-job")]);
  assert.ok(r.ok, r.out);
  const after = "Creates a job. A job is billed after it runs, by the credits each page or task it fetches uses: 1 credit for a basic request";
  assert.ok(r.dist(tool).includes(after), r.dist(tool));
  assert.ok(r.dist(actionFile("create-job")).includes(after), r.dist(actionFile("create-job")));
});
test("an ai line in shared/actions.yaml that says what a call costs fails the render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(undefined, `actions:\n  get_job:\n    ai: "Reads a job. Costs no credits."\n`),
}, "shared/actions.yaml: actions.get_job.ai says what the call costs", tokenSpec));
test("{{tool:…}} and {{field:…}} read in each host's own terms", () => {
  const tool = "dist/mastra/integrations/zenrows/src/generated/get-job.ts";
  const wording = `actions:\n  create_job:\n    name: "Create Job"\n  get_job:\n    ai: "Read it after {{tool:create_job}}, or use {{tool:fetch}}; pass {{field:job_id}} back."\n`;
  const r = run({ ...typesBilling({ free: ["GET /stub/{job_id}", "POST /stub-jobs"] }), ...apVars(undefined, wording) }, tokenSpec, [tool, actionFile("get-job")]);
  assert.ok(r.ok, r.out);
  assert.ok(r.dist(actionFile("get-job")).includes('description: "Read it after Create Job, or use Scrape URL; pass Job ID back. This call uses no credits."'), r.dist(actionFile("get-job")));
  assert.ok(r.dist(tool).includes("Read it after zenrows-create-job, or use zenrows-scrape; pass job_id back. This call uses no credits."), r.dist(tool));
});
test("{{tool:…}} for an endpoint we don't offer fails the render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(undefined, `actions:\n  get_job:\n    ai: "Then use {{tool:nope}}."\n`),
}, "shared/actions.yaml: actions.get_job.ai names {{tool:nope}}, but the API spec has no endpoint we offer by that id", tokenSpec));
test("{{field:…}} for a field the endpoint doesn't take fails the render", fails({
  ...typesBilling({ free: ["GET /stub/{job_id}"] }),
  ...apVars(undefined, `actions:\n  get_job:\n    description: "Pass {{field:cursor}}."\n`),
}, 'shared/actions.yaml: actions.get_job.description names {{field:cursor}}, but the API spec takes no "cursor" in GET /stub/{job_id}', tokenSpec));
test("an offered endpoint that takes the key neither way fails the Activepieces render", fails({
  "openapi-tokens.json": JSON.stringify({ ...typesSpec, paths: { ...typesSpec.paths, "/stub-types": { get: { ...typesSpec.paths["/stub-types"].get, security: [{ other: [] }] } } } }),
  "shared/billing.yaml": typesBilling({ free: ["GET /stub-types"] })["shared/billing.yaml"],
}, "platforms/activepieces/scripts/render.mjs: the API spec takes the key for GET /stub-types neither in X-API-Key nor as apikey", tokenSpec));
test("{{cost:<kind>}} is the cost sentence of that billing kind, and an unknown kind fails", () => {
  const r = run(renders('export default ({ fill }) => ({ "note.txt": fill("{{cost:free}} {{cost:per_credit}}") });\n'), tokenSpec, ["dist/piece/note.txt"]);
  assert.ok(r.ok, r.out);
  assert.match(r.dist("dist/piece/note.txt"), /^This call uses no credits\. Zenrows charges 1 credit for a basic request/);
  fails(renders('export default ({ fill }) => ({ "note.txt": fill("{{cost:nope}}") });\n'), 'no cost sentence for billing kind "nope"', tokenSpec)();
});
test("a render script fills a template's variables and snippets", () => {
  const r = run(renders('export default ({ fill }) => ({ "note.txt": fill("{{host_full}}: {{< cost}}") });\n', { "shared/text/cost.md": "One credit.\n" }), tokenSpec, ["dist/piece/note.txt"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/note.txt"), "Piece: One credit.");
});

// release-please rewrites each JSON file it bumps as JSON.stringify(…, null, 2), so
// the render writes them that way too, and a release PR changes only the version.
test("a JSON file release-please bumps renders in release-please's layout", () => {
  const source = readFileSync(join(root, "platforms/copilot/plugin.json"), "utf8").replace(/"keywords": \[[^\]]*\]/, '"keywords": ["web-scraping", "mcp"]');
  const r = run({ "platforms/copilot/plugin.json": source });
  assert.ok(r.ok, r.out);
  assert.ok(r.dist("dist/copilot/plugin.json").includes('"keywords": [\n    "web-scraping",\n    "mcp"\n  ]\n}\n'), r.dist("dist/copilot/plugin.json"));
});
test("a JSON file release-please doesn't bump keeps its layout", () => {
  const r = run({ ...piece, "platforms/piece/data.json": '{ "tags": ["a", "b"] }\n' });
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/data.json"), '{ "tags": ["a", "b"] }\n');
});

// {{…}} that isn't one of this tool's tokens ships as written.
const theirs = {
  // JSX, with a string, a number and a variable value, spaced or not.
  "platforms/piece/src/view.tsx": "export const v = <p style={{ color: \"red\" }} />;\nexport const w = <p style={{ width: 100 }} />;\nexport const x = <p style={{ color: accent }} />;\nexport const y = <p style={{flex:1}} />;\n",
  // Make, Zapier, n8n and a Handlebars block, plus an empty pair.
  "platforms/piece/communication.json": "{ \"make\": \"{{parameters.url}} {{1.name}}\", \"zapier\": \"{{bundle.inputData.url}}\", \"n8n\": \"{{ $json.url }}\", \"hbs\": \"{{#if x}}{{/if}}\", \"empty\": \"{{}}\" }\n",
};
test("other tools' {{…}} ship as written", () => {
  const r = run({ ...piece, ...theirs });
  assert.ok(r.ok, r.out);
  for (const [path, text] of Object.entries(theirs)) assert.equal(r.dist(path.replace(/^platforms\//, "dist/")), text);
});

// A plugin's README is shared/README.md with the host's slots from readme/.
const copilotReadme = () => readFileSync(join(root, "dist/copilot/README.md"), "utf8");
test("a plugin host with its own README.md fails", fails({ "platforms/copilot/README.md": "# Copilot\n" }, "a plugin's README comes from shared/README.md"));
test("a plugin host without readme/setup.md fails", fails({ "platforms/copilot/readme/setup.md": null }, "slot {{> setup}} has no platforms/copilot/readme/setup.md"));
test("a readme/ file shared/README.md has no slot for fails", fails({ "platforms/copilot/readme/extra.md": "x\n" }, "platforms/copilot/readme/extra.md: shared/README.md has no slot for it"));
test("the optional more slot is left out without its file and put in with it", () => {
  assert.ok(!copilotReadme().includes("{{"), "no slot token left in the rendered README");
  assert.ok(!copilotReadme().includes("For maintainers"));
  const r = run({ "platforms/copilot/readme/more.md": "## For maintainers\n\nRelease notes live elsewhere.\n" }, {}, ["dist/copilot/README.md"]);
  assert.ok(r.ok, r.out);
  assert.match(r.dist("dist/copilot/README.md"), /## Setup\n[\s\S]*## For maintainers\n\nRelease notes live elsewhere\.\n\n## Privacy/);
});

// A host's scripts/ is its own tooling: never shipped, and its validate.mjs runs.
test("a host's scripts/ isn't shipped", () => {
  const r = run({ "platforms/copilot/scripts/tool.sh": "echo hi\n" }, {}, ["dist/copilot/scripts/tool.sh"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/copilot/scripts/tool.sh"), undefined);
});
test("a host's own scripts/validate.mjs failing fails validate", fails({ "platforms/copilot/scripts/validate.mjs": "console.error('too long'); process.exit(1);\n" }, "copilot: platforms/copilot/scripts/validate.mjs failed:\ntoo long"));

// dist/<host>/CHANGELOG.md is release-please's: the render keeps it.
test("the render keeps a host's CHANGELOG.md", () => {
  const r = run({ "dist/copilot/CHANGELOG.md": "# Changelog\n\n## 0.2.0\n" }, {}, ["dist/copilot/CHANGELOG.md"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/copilot/CHANGELOG.md"), "# Changelog\n\n## 0.2.0\n");
});

// A YAML listing that names its schema on line 1 is checked against it, as
// plain data: o11 rejects duplicate keys, aliases and unknown fields.
// o11's generated listing, with each shared snippet written back as its
// placeholder, so the copy is a valid listing that doesn't write a snippet out.
const o11Listing = () => {
  let text = readFileSync(join(root, "dist/o11/o11.yaml"), "utf8");
  for (const file of readdirSync(join(root, "shared/text"))) {
    text = text.replaceAll(readFileSync(join(root, "shared/text", file), "utf8").trim(), `{{< ${file.replace(/\.md$/, "")}}}`);
  }
  return text;
};
const listing = (extra) => ({ "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\n", "platforms/piece/README.md": "# Piece\n", "platforms/piece/listing.yaml": o11Listing() + extra });
test("a listing that matches its schema passes", passes(listing("")));
test("a listing with a duplicate key fails", fails(listing("spec: 2026-11-01\n"), "piece: listing.yaml: Map keys must be unique"));
test("a listing with a YAML alias fails", fails(listing("review: &r x\nnotes: *r\n"), "uses a YAML alias"));
test("a listing with a field its schema doesn't allow fails", fails(listing("made_up_field: 1\n"), "must NOT have additional properties"));

// Snippets: plain text, one line, used somewhere.
const snippet = (text) => ({ ...piece, "shared/text/cost.md": text, "platforms/piece/src/index.ts": "export const cost = {{text:cost}};\n" });
test("a snippet with parameter names and brackets passes", passes(snippet("A request with js_render returns [{...}] and costs 5 credits.\n")));
test("a snippet with backticks fails", fails(snippet("A request with `js_render` costs 5 credits.\n"), "has markdown"));
test("a snippet with a link fails", fails(snippet("See [pricing](https://www.zenrows.com/pricing).\n"), "has markdown"));
test("a snippet with a blank last line or CRLF renders clean", () => {
  for (const text of ["A request costs 5 credits.\n\n", "A request costs 5 credits.\r\n"]) {
    const r = run(snippet(text));
    assert.ok(r.ok, r.out);
    assert.equal(r.dist("dist/piece/src/index.ts"), "export const cost = \"A request costs 5 credits.\";\n");
  }
});
test("a snippet with a {{…}} fails", fails(snippet("Ask {{host}} to sign in.\n"), "uses {{…}}; a snippet is a plain fact"));
test("a snippet named only in a vars.yaml comment isn't a use", warns({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\n# shared text goes in as {{< cost}}\n" }, "isn't used by any skill or host"));
test("a snippet on two lines fails", fails(snippet("One fact.\nAnother fact.\n"), "has more than one line"));
test("a snippet named only in a code host README isn't a use", warns({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/README.md": "# Piece\n\nUses `{{< cost}}`.\n" }, "isn't used by any skill or host"));
test('"ZenRows" in a host fails; the GitHub org and the client header pass', () => {
  fails({ ...piece, "platforms/piece/src/index.ts": "export const name = \"ZenRows\";\n" }, 'platforms/piece/src/index.ts writes "ZenRows"; write Zenrows')();
  fails({ ...piece, "platforms/piece/README.md": "# Piece for ZenRows\n" }, 'platforms/piece/README.md writes "ZenRows"')();
  const r = run({ ...piece, "platforms/piece/src/index.ts": "export const repo = \"ZenRows/zenrows-integrations\";\nexport const h = { \"X-ZenRows-Client\": \"piece\" };\n" });
  assert.ok(r.ok, r.out);
});
test("a snippet written out instead of its token fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/src/index.ts": "export const a = {{text:cost}};\n// A request costs 5 credits.\n" }, "platforms/piece/src/index.ts writes out shared/text/cost.md"));
test("a snippet the cost sentences in scripts/lib.mjs use isn't reported unused", () => {
  const r = run({});
  assert.ok(r.ok, r.out);
  for (const name of ["billing-free", "billing-after-run"]) assert.ok(!r.out.includes(`shared/text/${name}.md isn't used`), r.out);
});
test("shared/text/request-timeout.md states the wait shared/vars.yaml sets", () => {
  const ms = parseYaml(readFileSync(join(root, "shared/vars.yaml"), "utf8")).request_timeout_ms;
  assert.ok(Number.isInteger(ms) && ms > 0, "request_timeout_ms is a whole number of milliseconds");
  assert.match(readFileSync(join(root, "shared/text/request-timeout.md"), "utf8"), new RegExp(`\\b${ms / 1000} seconds\\b`));
});
test("an unused snippet only warns", warns({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n" }, "shared/text/cost.md isn't used by any skill or host yet"));
test("a missing snippet fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const cost = {{text:nope}};\n" }, "there's no shared/text/nope.md"));

// A JSON file is checked against the schema it declares, whichever draft that schema is written in.
test("a JSON file against a draft-07 schema is checked", fails({ ...piece, "platforms/piece/turbo.json": '{ "$schema": "https://v2-9-16.turborepo.dev/schema.json", "tasks": "build" }\n' }, "piece: turbo.json /tasks must be object"));

// The Mastra host exposes or excludes every parameter of its tools' slices, so a new one forces a decision.
test("a parameter the Mastra tools neither expose nor exclude fails", () => {
  const endpoints = readFileSync(join(root, "shared/endpoints.yaml"), "utf8").replace(/^(  parameters: \[url, mode, js_render, )/m, "$1custom_headers, ");
  assert.ok(endpoints.includes("custom_headers"), "the fetch slice gained custom_headers");
  fails({ "shared/endpoints.yaml": endpoints }, "the scrape tool neither exposes nor excludes custom_headers from shared/endpoints.yaml's fetch")();
});

test("a response_type value the Mastra scrape tool neither offers nor excludes fails", () => {
  const spec = structuredClone(published);
  const parameters = [...(spec.paths["/"].parameters ?? []), ...(spec.paths["/"].get.parameters ?? [])];
  const param = parameters.map((p) => (p.$ref ? spec.components.parameters[p.$ref.split("/").pop()] : p)).find((p) => p.name === "response_type");
  assert.ok(param?.schema?.enum, "GET / has a response_type enum");
  param.schema.enum.push("docx");
  fails({ "openapi-rt.json": JSON.stringify(spec) }, "the API spec gives response_type docx, which the scrape tool neither offers nor excludes", { ZENROWS_OPENAPI: "openapi-rt.json" })();
});

// Mastra generates a tool for every endpoint shared/billing.yaml offers that has no hand-written one.
test("an endpoint shared/billing.yaml offers becomes a Mastra tool", () => {
  const tool = "dist/mastra/integrations/zenrows/src/generated/get-job.ts";
  const index = "dist/mastra/integrations/zenrows/src/generated/index.ts";
  // o11 lists the endpoint too, and needs a description for it.
  const spec = JSON.parse(tokenSpecText);
  spec.paths["/stub/{job_id}"].get.description = "Reads one job.\n\nMore for the API docs.";
  const r = run({ "openapi-tokens.json": JSON.stringify(spec), "shared/billing.yaml": billingWith({ free: ["GET /stub/{job_id}"] }) }, tokenSpec, [tool, index]);
  assert.ok(r.ok, r.out);
  assert.match(r.dist(tool), /id: 'zenrows-get-job'/);
  assert.match(r.dist(tool), /"server":"https:\/\/async\.example\.com\/v1","path":"\/stub\/\{job_id\}"/);
  assert.match(r.dist(tool), /job_id: z\.string\(\)/);
  assert.match(r.dist(tool), /description: 'Read a job\. Reads one job\. This call uses no credits\.'/);
  assert.match(r.dist(index), /zenrowsGetJob: createZenrowsGetJobTool\(options\)/);
});
test("a Mastra tool input named in two places of one operation fails", () => {
  const spec = JSON.parse(tokenSpecText);
  spec.paths["/stub-dup/{id}"] = {
    get: {
      operationId: "readDup",
      summary: "Read a dup",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "id", in: "query", schema: { type: "string" } },
      ],
    },
  };
  const billing = JSON.parse(billingWith({ free: ["GET /stub-dup/{id}"] }));
  fails({ "openapi-tokens.json": JSON.stringify(spec), "shared/billing.yaml": JSON.stringify(billing) }, 'the API spec has "id" in two places of GET /stub-dup/{id}', tokenSpec)();
});
// A failure the spec causes in a host's render.mjs says "the API spec", which api-changed.yml looks for.
test("a spec-caused failure in the Mastra render says the API spec, as api-changed.yml expects", () => {
  const spec = structuredClone(published);
  const parameters = [...(spec.paths["/"].parameters ?? []), ...(spec.paths["/"].get.parameters ?? [])];
  const wait = parameters.find((p) => p.name === "wait");
  assert.ok(wait, "GET / has a wait parameter");
  delete wait.description;
  const r = run({ "openapi-nodesc.json": JSON.stringify(spec) }, { ZENROWS_OPENAPI: "openapi-nodesc.json" });
  assert.ok(!r.ok, "the render failed");
  assert.match(r.out, /platforms\/mastra\/scripts\/render\.mjs: the API spec has no description for wait/);
  const workflow = readFileSync(join(root, ".github/workflows/api-changed.yml"), "utf8");
  const pattern = workflow.match(/grep -E '(\^❌ [^']+)'/)[1];
  assert.match(r.out.split("\n").find((line) => line.startsWith("❌")), new RegExp(pattern));
});
