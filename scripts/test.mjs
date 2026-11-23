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
      get: { operationId: "fetchPage", summary: "Fetch a page", description: "Fetches a stub page." },
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
typesSpec.paths["/stub/{job_id}"].get.description = "Reads a job.";
typesSpec.paths["/stub-types"] = {
  get: {
    operationId: "getTypes",
    summary: "Read the types",
    description: "Reads the types.",
    security: [{ apiKeyHeader: [] }],
    parameters: [
      { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
      { name: "download", in: "query", schema: { type: "boolean" } },
      { name: "status", in: "query", schema: { type: "string", enum: ["all", "failed"] } },
      { name: "filter", in: "query", schema: { type: "object" } },
      { name: "cursor", in: "query", schema: { type: "string" } },
    ],
  },
};
const actionFile = (name) => `dist/activepieces/src/lib/actions/${name}.ts`;
const actionFiles = ["generated", "get-job", "create-job", "get-types", "fetch-page", "fetch", "extract"].map(actionFile);
const actions = (kinds) => {
  const billing = parseYaml(billingWith(kinds));
  if (!Object.values(kinds).flat().includes("GET /stub-types")) billing.not_offered.push("GET /stub-types");
  return run({ "openapi-tokens.json": JSON.stringify(typesSpec), "shared/billing.yaml": JSON.stringify(billing) }, tokenSpec, actionFiles);
};
test("Activepieces gets an action per offered endpoint, and none for the rest", () => {
  const r = actions({ free: ["GET /stub/{job_id}", "POST /stub-jobs"] });
  assert.ok(r.ok, r.out);
  const list = r.dist(actionFile("generated"));
  assert.ok(list.includes("import { getJobAction } from './get-job';\nimport { createJobAction } from './create-job';\n"), list);
  assert.ok(list.includes("getJobAction, createJobAction"), list);
  const job = r.dist(actionFile("get-job"));
  const create = r.dist(actionFile("create-job"));
  assert.ok(job.includes("import { createAction, Property } from '@activepieces/pieces-framework';"), job);
  assert.ok(job.includes('export const getJobAction = createAction({\n  auth: zenrowsAuth,\n  name: "get_job",\n  displayName: "Read A Job",'), job);
  assert.ok(job.includes('job_id: Property.ShortText({ displayName: "Job ID", required: true }),'), job);
  assert.ok(job.includes('operation: {"method":"GET","server":"https://async.example.com/v1","path":"/stub/{job_id}","key":"query"}'), job);
  assert.ok(create.includes('urls: Property.Json({ displayName: "URLs", required: false }),'), create);
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
    'status: Property.StaticDropdown({ displayName: "Status", required: false, options: { disabled: false, options: [{ label: "all", value: "all" }, { label: "failed", value: "failed" }] } }),',
    'filter: Property.Json({ displayName: "Filter", required: false }),',
    'cursor: Property.ShortText({ displayName: "Cursor", required: false }),',
    '"path":"/stub-types","key":"header","query":["limit","download","status","filter","cursor"]}',
  ]) assert.ok(ts.includes(line), `expected ${line} in:\n${ts}`);
});
test("an offered endpoint that takes the key neither way fails the Activepieces render", fails({
  "openapi-tokens.json": JSON.stringify({ ...typesSpec, paths: { ...typesSpec.paths, "/stub-types": { get: { ...typesSpec.paths["/stub-types"].get, security: [{ other: [] }] } } } }),
  "shared/billing.yaml": billingWith({ free: ["GET /stub-types"] }),
}, "platforms/activepieces/scripts/render.mjs: GET /stub-types takes the key neither in X-API-Key nor as apikey", tokenSpec));
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
test("a snippet written out instead of its token fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/src/index.ts": "export const a = {{text:cost}};\n// A request costs 5 credits.\n" }, "platforms/piece/src/index.ts writes out shared/text/cost.md"));
test("an unused snippet only warns", warns({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n" }, "shared/text/cost.md isn't used by any skill or host yet"));
test("a missing snippet fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const cost = {{text:nope}};\n" }, "there's no shared/text/nope.md"));
