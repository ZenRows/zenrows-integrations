// Renders dist/<host>/ from skills/, shared/ and platforms/<host>/. With
// --check, writes nothing and fails if a committed file differs from a fresh
// render.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { distDir, hosts, listFiles, renderHost, root } from "./lib.mjs";

const check = process.argv.includes("--check");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const expected = new Map();
for (const host of only.length ? only : hosts()) {
  for (const [file, buf] of renderHost(host)) expected.set(`dist/${host}/${file}`, buf);
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
    console.error("\ndist/ is generated. Run `npm run render` and commit the result; never edit dist/ by hand.");
    process.exit(1);
  }
  console.log(`dist/ is up to date (${expected.size} files).`);
} else {
  for (const host of only.length ? only : hosts()) rmSync(join(distDir, host), { recursive: true, force: true });
  for (const [path, buf] of expected) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), buf);
  }
  console.log(`Rendered ${expected.size} files.`);
}
