// Turns a copy of dist/activepieces/ into the piece as a PR to activepieces
// adds it, by their conventions: the logo on their CDN (a maintainer uploads
// shared/assets/logo.png there), the PR author in authors, no code comments
// (their CLAUDE.md), and no "text" + '.' joins left from the render. Our repo
// keeps its comments; only the copy changes. check.sh --upstream runs it.
//
//   node upstream.mjs <piece dir> <github login>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, login] = process.argv.slice(2);
if (!dir || !/^[A-Za-z0-9-]+$/.test(login ?? "")) {
  console.error("usage: node upstream.mjs <piece dir> <github login>");
  process.exit(1);
}

const files = (d) => readdirSync(d).flatMap((name) => (statSync(join(d, name)).isDirectory() ? files(join(d, name)) : [join(d, name)]));

for (const file of files(join(dir, "src")).filter((f) => f.endsWith(".ts"))) {
  let text = readFileSync(file, "utf8");
  const code = text.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n").replace(/https?:\/\/\S+/g, "");
  if (/\/\*|[^:'"`]\/\/ /.test(code)) {
    throw new Error(`${file}: has a block or end-of-line comment; strip it by hand or teach upstream.mjs`);
  }
  text = text
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/"((?:[^"\\\n]|\\.)*)" \+ '\.'/g, (_, body) => `"${body}."`);
  if (file.endsWith(join("src", "index.ts"))) {
    const before = text;
    text = text
      .replace(/logoUrl: '[^']*'/, "logoUrl: 'https://cdn.activepieces.com/pieces/zenrows.png'")
      .replace(/authors: \[[^\]]*\]/, `authors: ['${login}']`);
    if (!text.includes("cdn.activepieces.com/pieces/zenrows.png") || !text.includes(`authors: ['${login}']`) || text === before) {
      throw new Error(`${file}: couldn't set logoUrl and authors`);
    }
  }
  writeFileSync(file, text);
}
console.log(`upstream copy ready in ${dir} (author ${login}; attach shared/assets/logo.png to the PR for their CDN)`);
