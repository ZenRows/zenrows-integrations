// npm run mirror -- <host> <dir>: makes <dir>, a clone of the host's mirror repo
// (vars.yaml mirror:), match what the mirror publishes (see renderMirror in
// lib.mjs). Everything in <dir> except .git is replaced. Run by
// .github/workflows/mirror.yml; committing and pushing is left to the caller.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hosts, renderMirror } from "./lib.mjs";

const [host, target] = process.argv.slice(2);
if (!host || !hosts().includes(host) || !target) {
  console.error(`Usage: npm run mirror -- <host> <dir>, host one of: ${hosts().join(", ")}`);
  process.exit(1);
}
const files = renderMirror(host);
const dir = resolve(target);
mkdirSync(dir, { recursive: true });
for (const entry of readdirSync(dir)) {
  if (entry !== ".git") rmSync(join(dir, entry), { recursive: true, force: true });
}
for (const [file, buf] of files) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), buf);
}
console.log(`Wrote ${files.size} files for ${host}'s mirror into ${dir}.`);
