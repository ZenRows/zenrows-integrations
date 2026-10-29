// npm run override -- <host> <skill>      copy a shared skill into platforms/<host> and record its hash
// npm run override:ack -- <host> <skill>  record the shared skill's current hash after reviewing the copy
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platformsDir, readLock, root, sha256 } from "./lib.mjs";

const [mode, host, skill] = process.argv.slice(2);
const shared = `skills/${skill}/SKILL.md`;
const copy = join(platformsDir, host ?? "", "skills", skill ?? "", "SKILL.md");

if (!["create", "ack"].includes(mode) || !host || !skill) {
  console.error("usage: npm run override -- <host> <skill> | npm run override:ack -- <host> <skill>");
  process.exit(1);
}
if (!existsSync(join(platformsDir, host))) throw new Error(`no platforms/${host}`);
if (!existsSync(join(root, shared))) throw new Error(`no ${shared}`);

if (mode === "create") {
  if (existsSync(copy)) throw new Error(`platforms/${host}/${shared} already exists`);
  mkdirSync(join(copy, ".."), { recursive: true });
  copyFileSync(join(root, shared), copy);
} else if (!existsSync(copy)) {
  throw new Error(`platforms/${host}/${shared} doesn't exist; nothing to acknowledge`);
}

// overrides.lock is created by the first override of a host.
const lock = readLock(host);
lock[shared] = sha256(readFileSync(join(root, shared))).slice(0, 12);
const header =
  "# Whole-file overrides of shared files, with the sha256 of the shared file each\n" +
  "# was copied from. Written by `npm run override` and `npm run override:ack`.";
const body = Object.keys(lock)
  .sort()
  .map((k) => `${k}: ${lock[k]}`)
  .join("\n");
writeFileSync(join(platformsDir, host, "overrides.lock"), `${header}\n${body}\n`);
console.log(`${mode === "create" ? "Created" : "Acknowledged"} platforms/${host}/${shared} (${lock[shared]})`);
