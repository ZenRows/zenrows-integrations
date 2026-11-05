// npm run mirror -- <host> <dir> [<tag>]: makes <dir>, a clone of the host's
// mirror repo (vars.yaml mirror:), match what the mirror publishes (see
// renderMirror in lib.mjs). <tag> is the release being published
// (<host>-v<version>); without it, the README banner names this checkout's
// commit instead. Everything in <dir> except .git is replaced. Run by
// .github/workflows/mirror.yml; committing and pushing is left to the caller.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hosts, renderMirror, vars } from "./lib.mjs";

const [host, target, tag] = process.argv.slice(2);
if (!host || !hosts().includes(host) || !target) {
  console.error(`Usage: npm run mirror -- <host> <dir> [<tag>], host one of: ${hosts().join(", ")}`);
  process.exit(1);
}
if (tag && tag !== `${host}-v${vars(host).version}`) {
  console.error(`${tag} isn't this checkout's ${host} release: ${host} is at ${vars(host).version}.`);
  process.exit(1);
}
const sha = tag ? undefined : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const files = renderMirror(host, { tag, sha });
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
