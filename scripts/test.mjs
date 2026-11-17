// npm test: the mistakes the render and validate must catch. Each case copies
// the repo to a temporary folder, makes one change (a throwaway code host, a
// snippet, …), runs npm run render and npm run validate there, and checks the
// first failure, or that both pass. Add a case whenever a new rule is added.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { root } from "./lib.mjs";

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
    for (const script of ["render", "validate"]) {
      const r = spawnSync("node", [join("scripts", `${script}.mjs`)], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...(existsSync(cachedSpec) ? { ZENROWS_OPENAPI: cachedSpec } : {}), ...env },
      });
      if (r.status !== 0) return { ok: false, out: `${r.stdout}${r.stderr}` };
    }
    const outs = [...Object.keys(files).filter((p) => p.startsWith("platforms/")).map((p) => p.replace(/^platforms\//, "dist/")), ...reads];
    const rendered = new Map(outs.map((out) => [out, existsSync(join(dir, out)) ? readFileSync(join(dir, out), "utf8") : undefined]));
    return { ok: true, out: "", dist: (path) => rendered.get(path) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const passes = (files, env) => () => {
  const r = run(files, env);
  assert.ok(r.ok, r.out);
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

// api: in vars.yaml, checked against a small spec stub instead of the published one.
const stubSpec = {
  "openapi-stub.json": JSON.stringify({
    openapi: "3.1.0",
    paths: { "/": { parameters: [{ $ref: "#/components/parameters/mode" }, { name: "url", in: "query" }], get: {} } },
    components: { parameters: { mode: { name: "mode", in: "query" } } },
  }),
};
const withSpec = { ZENROWS_OPENAPI: "openapi-stub.json" };
const sends = (api, code) => ({ ...piece, ...stubSpec, "platforms/piece/vars.yaml": `host_full: Piece\nkind: code\napi:\n  ${api}\n`, "platforms/piece/src/index.ts": `${code}\n` });
test("a host's api: passes when the API takes each parameter and the host sends it", passes(sends('GET /: [url, mode]', 'export const q = { url: "https://example.com", mode: "auto" };'), withSpec));
test("an api: operation the API doesn't have fails", fails(sends('GET /nope: []', 'export const q = {};'), 'the API has no operation "GET /nope"', withSpec));
test("an api: parameter the operation doesn't take fails", fails(sends('GET /: [foo]', 'export const q = { foo: 1 };'), 'GET / doesn\'t take "foo"', withSpec));
test("an api: parameter sent as a JavaScript shorthand property passes", passes(sends('GET /: [url, mode]', 'export const q = ({ url, mode }) => ({ url, mode });'), withSpec));
test("an api: operation whose value isn't a list fails", fails(sends('GET /: url', 'export const q = { url: "x" };'), 'GET / must list parameter names', withSpec));
test("an api: parameter the host never sends fails", fails(sends('GET /: [url, mode]', 'export const q = { mode: "auto" };'), 'declares "url" for GET /, but no file in dist/piece sends it', withSpec));

// {{api:…}} renders part of an operation from the spec as JSON Schema; {{api-sha256}} the spec's hash.
const tokenSpecText = JSON.stringify({
  openapi: "3.1.0",
  paths: {
    "/": {
      parameters: [
        { name: "url", in: "query", required: true, description: "The page.", schema: { type: "string", format: "uri" }, example: "https://example.com/" },
        { $ref: "#/components/parameters/mode" },
      ],
      get: {},
    },
    "/jobs/{job_id}": {
      servers: [{ url: "https://async.example.com/v1" }],
      get: { summary: "Read a job", parameters: [{ name: "job_id", in: "path", required: true, schema: { type: "string", examples: ["J1"] } }] },
    },
    "/jobs": {
      post: {
        summary: "Create a job",
        description: "Sends every URL at once.",
        servers: [{ url: "https://jobs.example.com/v1" }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Job" }, examples: { two: { value: { urls: ["https://a.example/"] } } } } } },
        responses: {
          201: { description: "Created", content: { "application/json": { example: { job_id: "J1" } } } },
          401: { description: "No key", content: { "application/problem+json": { example: { code: "AUTH001" } } } },
          default: { description: "Other", content: { "application/json": { example: {} } } },
        },
      },
    },
  },
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    parameters: { mode: { name: "mode", in: "query", schema: { type: "string", enum: ["auto"] } } },
    schemas: { Job: { type: "object", properties: { urls: { type: "array", items: { $ref: "#/components/schemas/Url" } } } }, Url: { type: "string" } },
  },
});
const usesToken = (token) => ({ ...piece, "openapi-tokens.json": tokenSpecText, "platforms/piece/src/index.ts": `export const p = ${token};\n` });
const tokenSpec = { ZENROWS_OPENAPI: "openapi-tokens.json" };
const rendersTo = (token, expected) => () => {
  const r = run(usesToken(token), tokenSpec, ["dist/piece/src/index.ts"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/index.ts"), `export const p = ${expected};\n`);
};
test("{{api:…}} renders the query parameters it names", rendersTo("{{api:GET / query url}}", '{"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The page."}},"required":["url"]}'));
test("{{api:…}} without names renders the whole part, $refs resolved", rendersTo("{{api:GET / query}}", '{"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The page."},"mode":{"type":"string","enum":["auto"]}},"required":["url"]}'));
test("{{api:…}} renders path parameters", rendersTo("{{api:GET /jobs/{job_id} path}}", '{"type":"object","properties":{"job_id":{"type":"string","examples":["J1"]}},"required":["job_id"]}'));
test("{{api:…}} renders a JSON body with its $refs inlined", rendersTo("{{api:POST /jobs body}}", '{"type":"object","properties":{"urls":{"type":"array","items":{"type":"string"}}}}'));
test("{{api-sha256}} is the sha256 of the spec", rendersTo('"{{api-sha256}}"', JSON.stringify(createHash("sha256").update(tokenSpecText).digest("hex"))));
test("{{api:…}} for an operation the API doesn't have fails", fails(usesToken("{{api:GET /nope query}}"), 'the API has no operation "GET /nope"', tokenSpec));
test("{{api:…}} for a parameter the operation doesn't have fails", fails(usesToken("{{api:GET / query url,page}}"), 'GET / has no query parameter "page"', tokenSpec));
test("{{api:… summary}} and {{api:… description}} render the operation's text", rendersTo("[{{api:POST /jobs summary}}, {{api:POST /jobs description}}]", '["Create a job", "Sends every URL at once."]'));
test("{{api:… server}} takes the operation's server, then the path's, then the spec's", rendersTo("[{{api:POST /jobs server}}, {{api:GET /jobs/{job_id} server}}, {{api:GET / server}}]", '["https://jobs.example.com/v1", "https://async.example.com/v1", "https://api.example.com/v1"]'));
test("{{api:… description}} for an operation without one fails", fails(usesToken("{{api:GET /jobs/{job_id} description}}"), "the API spec has no description for GET /jobs/{job_id}", tokenSpec));
test("{{api:… example}} builds the example request from the spec's parameter and body examples", rendersTo("[{{api:GET / example}}, {{api:GET /jobs/{job_id} example}}, {{api:POST /jobs example}}]", '[{"queryParams":{"url":"https://example.com/"}}, {"pathParams":{"job_id":"J1"}}, {"body":{"urls":["https://a.example/"]}}]'));
test("{{api:… responses}} lists the spec's response examples in order, without default", rendersTo("{{api:POST /jobs responses}}", '[{"status":201,"contentType":"application/json","description":"Created","body":{"job_id":"J1"}},{"status":401,"contentType":"application/problem+json","description":"No key","body":{"code":"AUTH001"}}]'));
test("{{api:… responses}} is empty where the spec has no response examples", rendersTo("{{api:GET /jobs/{job_id} responses}}", "[]"));

// A host's scripts/render.mjs builds files from the spec and its data/, which isn't shipped.
const renders = (script, extra = {}) => ({
  ...piece,
  "openapi-tokens.json": tokenSpecText,
  "platforms/piece/data/name.txt": "Piece listing\n",
  "platforms/piece/scripts/render.mjs": script,
  ...extra,
});
const generator = `import { readFileSync } from "node:fs";
import { join } from "node:path";
export default ({ dataDir, apiValue, specSha256 }) => ({
  "listing.json": JSON.stringify({ name: readFileSync(join(dataDir, "name.txt"), "utf8").trim(), required: apiValue("GET /", "query").required, sha: specSha256.length }) + "\\n",
});
`;
test("a host's render script's files ship, and its data/ doesn't", () => {
  const r = run(renders(generator), tokenSpec, ["dist/piece/listing.json", "dist/piece/data/name.txt"]);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/listing.json"), '{"name":"Piece listing","required":["url"],"sha":64}\n');
  assert.equal(r.dist("dist/piece/data/name.txt"), undefined);
});
test("a host's render script that throws fails the render", fails(renders('export default () => { throw new Error("no fixture for batch_get"); };\n'), "no fixture for batch_get", tokenSpec));
test("a host's render script returning a file the host already has fails", fails(renders('export default () => ({ "src/index.ts": "x" });\n'), "platforms/piece/scripts/render.mjs returns src/index.ts, which platforms/piece/ already has", tokenSpec));

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
test("a snippet named only in a vars.yaml comment fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\n# shared text goes in as {{< cost}}\n" }, "isn't used by any skill or host"));
test("a snippet on two lines fails", fails(snippet("One fact.\nAnother fact.\n"), "has more than one line"));
test("a snippet named only in a code host README fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/README.md": "# Piece\n\nUses `{{< cost}}`.\n" }, "isn't used by any skill or host"));
test("a snippet written out instead of its token fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n", "platforms/piece/src/index.ts": "export const a = {{text:cost}};\n// A request costs 5 credits.\n" }, "platforms/piece/src/index.ts writes out shared/text/cost.md"));
test("an unused snippet fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n" }, "isn't used by any skill or host"));
test("a missing snippet fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const cost = {{text:nope}};\n" }, "there's no shared/text/nope.md"));
