// Renders dist/<host>/ from skills/, shared/ and platforms/<host>/, and the
// hosts list in README.md. With
// --check, writes nothing and fails if a committed file differs from a fresh
// render.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { distDir, hosts, isCodeHost, listFiles, renderHost, root, vars } from "./lib.mjs";

const check = process.argv.includes("--check");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const expected = new Map();
for (const host of only.length ? only : hosts()) {
  for (const [file, buf] of renderHost(host)) expected.set(`dist/${host}/${file}`, buf);
}
expected.set("README.md", hostsList());

// The "Supported hosts" list in README.md, between the hosts:start and
// hosts:end markers: one row per platforms/<host>, so a new host is listed
// as soon as it's rendered.
function hostsList() {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const start = readme.indexOf("<!-- hosts:start");
  const end = readme.indexOf("<!-- hosts:end -->");
  if (start < 0 || end < start) throw new Error("README.md has no <!-- hosts:start … --> … <!-- hosts:end --> markers");
  const rows = hosts()
    .map((host) => [vars(host).host_full ?? host, host])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, host]) => {
      const guide = isCodeHost(vars(host)) ? `platforms/${host}/README.md` : `dist/${host}/README.md`;
      return `| ${name} | [${guide}](${guide}) |`;
    });
  const table = ["| Host | Setup guide |", "|---|---|", ...rows].join("\n");
  const head = readme.slice(0, readme.indexOf("\n", start) + 1);
  return Buffer.from(`${head}${table}\n${readme.slice(end)}`);
}

if (check) {
  const problems = [];
  for (const [path, buf] of expected) {
    const file = join(root, path);
    if (!existsSync(file)) problems.push(`missing: ${path}`);
    else if (!readFileSync(file).equals(buf)) problems.push(`out of date: ${path}`);
  }
  for (const host of only.length ? only : hosts()) {
    for (const file of listFiles(join(distDir, host))) {
      if (!expected.has(`dist/${host}/${file}`)) problems.push(`not rendered from any source: dist/${host}/${file}`);
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("\ndist/ and the hosts list in README.md are generated. Run `npm run render` and commit the result; never edit them by hand.");
    process.exit(1);
  }
  console.log(`Rendered files are up to date (${expected.size} files).`);
} else {
  for (const host of only.length ? only : hosts()) rmSync(join(distDir, host), { recursive: true, force: true });
  for (const [path, buf] of expected) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), buf);
  }
  console.log(`Rendered ${expected.size} files.`);
}
