// npm run package -- <host>: builds what a host uploads by hand (for example
// OpenAI's ZIP) by running platforms/<host>/scripts/package.sh.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hosts, platformsDir } from "./lib.mjs";

const host = process.argv[2];
if (!host || !hosts().includes(host)) {
  console.error(`Usage: npm run package -- <host>, one of: ${hosts().join(", ")}`);
  process.exit(1);
}
const script = join(platformsDir, host, "scripts", "package.sh");
if (!existsSync(script)) {
  console.log(`${host} needs no packaging: it installs from dist/${host}/ (no platforms/${host}/scripts/package.sh).`);
  process.exit(0);
}
process.exit(spawnSync("bash", [script], { stdio: "inherit" }).status ?? 1);
