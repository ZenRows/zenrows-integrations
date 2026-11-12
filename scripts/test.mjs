// npm test: the mistakes the render and validate must catch. Each case copies
// the repo to a temporary folder, makes one change (a throwaway code host, a
// snippet, …), runs npm run render and npm run validate there, and checks the
// first failure, or that both pass. Add a case whenever a new rule is added.
import { execFileSync, spawnSync } from "node:child_process";
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
function run(files, env = {}) {
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
    const rendered = new Map(Object.keys(files).filter((p) => p.startsWith("platforms/")).map((p) => {
      const out = p.replace(/^platforms\//, "dist/");
      return [out, existsSync(join(dir, out)) ? readFileSync(join(dir, out), "utf8") : undefined];
    }));
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
test("an unused snippet fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n" }, "isn't used by any skill or host"));
test("a missing snippet fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const cost = {{text:nope}};\n" }, "there's no shared/text/nope.md"));
