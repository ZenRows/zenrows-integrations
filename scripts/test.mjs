// npm test: the mistakes the render and validate must catch. Each case copies
// the repo to a temporary folder, makes one change (a throwaway code host, a
// snippet, …), runs npm run render and npm run validate there, and checks the
// first failure, or that both pass. Add a case whenever a new rule is added.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { root } from "./lib.mjs";

// Every tracked file, so catalogs at the top of the repo (.claude-plugin/, …) come too.
const copied = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

// A code host that passes as it is; cases add or remove files from it.
const piece = {
  "platforms/piece/vars.yaml": "host_full: Piece\nkind: code\n",
  "platforms/piece/README.md": "# Piece\n",
  "platforms/piece/src/index.ts": "export const host = \"{{host_full}}\";\n",
};

// Runs render then validate in a copy of the repo with `files` written over it
// (null deletes). Returns { ok, out }: out is the failing step's output.
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
    return { ok: true, out: "" };
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
  fails({ ...piece, "platforms/piece/src/view.tsx": "export const a = \"{{host_full}}\";\n" }, "src/view.tsx still has an unrendered {{…}}")();
  fails({ ...piece, "platforms/piece/setup.py": "name = \"{{host_full}}\"\n" }, "setup.py still has an unrendered {{…}}")();
});
test("a mistyped snippet token fails", fails({
  ...piece,
  "shared/text/cost.md": "A request with js_render costs 5 credits.\n",
  "platforms/piece/src/index.ts": "export const cost = {{ < cost}};\n",
}, "src/index.ts still has an unrendered {{…}}"));
test("an unknown variable fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const a = \"{{hots_full}}\";\n" }, "unknown variable {{hots_full}}"));

test("a code host with no README fails", fails({ ...piece, "platforms/piece/README.md": null }, "a code host needs platforms/piece/README.md"));
test("a code host README with a {{…}} fails", fails({ ...piece, "platforms/piece/README.md": "# {{host_full}}\n" }, "README.md isn't rendered"));
test("a code host README that documents {{…}} in code passes", passes({ ...piece, "platforms/piece/README.md": "# Piece\n\nFacts come in through `{{text:name}}`.\n\n```\n{{< name}}\n```\n" }));
test("a code host with a skills/ folder fails", fails({ ...piece, "platforms/piece/skills/scrape/SKILL.md": "x\n" }, "a code host (kind: code) ships no skills"));
test("a skill reference in a code host fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const s = \"{{skill:batch}}\";\n" }, "a code host (kind: code) ships no skills"));
test("an unknown kind fails", fails({ ...piece, "platforms/piece/vars.yaml": "host_full: Piece\nkind: Code\n" }, "kind: Code in vars.yaml"));

// Snippets: plain text, one line, used somewhere.
const snippet = (text) => ({ ...piece, "shared/text/cost.md": text, "platforms/piece/src/index.ts": "export const cost = {{text:cost}};\n" });
test("a snippet with parameter names and brackets passes", passes(snippet("A request with js_render returns [{...}] and costs 5 credits.\n")));
test("a snippet with backticks fails", fails(snippet("A request with `js_render` costs 5 credits.\n"), "has markdown"));
test("a snippet with a link fails", fails(snippet("See [pricing](https://www.zenrows.com/pricing).\n"), "has markdown"));
test("a snippet on two lines fails", fails(snippet("One fact.\nAnother fact.\n"), "has more than one line"));
test("an unused snippet fails", fails({ ...piece, "shared/text/cost.md": "A request costs 5 credits.\n" }, "isn't used by any skill or host"));
test("a missing snippet fails", fails({ ...piece, "platforms/piece/src/index.ts": "export const cost = {{text:nope}};\n" }, "there's no shared/text/nope.md"));
