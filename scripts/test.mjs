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
function run(files) {
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
      const r = spawnSync("node", [join("scripts", `${script}.mjs`)], { cwd: dir, encoding: "utf8" });
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

const passes = (files) => () => {
  const r = run(files);
  assert.ok(r.ok, r.out);
};
const fails = (files, message) => () => {
  const r = run(files);
  assert.ok(!r.ok, "expected a failure, but render and validate passed");
  assert.ok(r.out.includes(message), `expected "${message}" in:\n${r.out}`);
};

test("the repo as it is passes", passes({}));
test("a code host passes", passes(piece));

test("a {{…}} in a file type the render doesn't fill fails", () => {
  fails({ ...piece, "platforms/piece/src/view.tsx": "export const a = \"{{host_full}}\";\n" }, "src/view.tsx still has an unrendered {{host_full}}")();
  fails({ ...piece, "platforms/piece/setup.py": "name = \"{{host_full}}\"\n" }, "setup.py still has an unrendered {{host_full}}")();
});
test("a mistyped snippet token fails", () => {
  for (const token of ["{{ < cost}}", "{{text: cost}}", "{{< COST}}", "{{Text:cost}}"]) {
    fails({
      ...piece,
      "shared/text/cost.md": "A request with js_render costs 5 credits.\n",
      "platforms/piece/src/index.ts": `export const cost = ${token};\n`,
    }, `src/index.ts still has an unrendered ${token}`)();
  }
});
test("a mistyped skill or variable token fails", () => {
  fails({ ...piece, "platforms/piece/src/index.ts": "export const s = \"{{skill: batch}}\";\n" }, "still has an unrendered {{skill: batch}}")();
  fails({ ...piece, "platforms/piece/src/index.ts": "export const a = \"{{Host_full}}\";\n" }, "still has an unrendered {{Host_full}}")();
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

// {{…}} that isn't one of this tool's tokens ships as written.
test("other tools' {{…}} ship as written", () => {
  const files = {
    ...piece,
    "platforms/piece/src/view.tsx": "export const v = <p style={{ color: \"red\" }} />;\n",
    "platforms/piece/communication.json": "{ \"url\": \"{{parameters.url}}\", \"n8n\": \"{{ $json.url }}\" }\n",
  };
  const r = run(files);
  assert.ok(r.ok, r.out);
  assert.equal(r.dist("dist/piece/src/view.tsx"), files["platforms/piece/src/view.tsx"]);
  assert.equal(r.dist("dist/piece/communication.json"), files["platforms/piece/communication.json"]);
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
