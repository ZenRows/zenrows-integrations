// npm run fetch-schemas: downloads every JSON Schema that a host's files
// declare in "$schema" into schemas/<domain>/<path>, so npm run validate checks
// them offline. Commit the result; re-run it when a host declares a new schema.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { catalogs, hosts, renderHost, root, schemaFile } from "./lib.mjs";

const urls = new Set();
for (const host of hosts()) {
  const tops = catalogs().filter((c) => c.host === host).map(({ file }) => [file, readFileSync(join(root, file))]);
  for (const [file, buf] of [...renderHost(host), ...tops]) {
    if (!file.endsWith(".json")) continue;
    const url = JSON.parse(buf.toString("utf8")).$schema;
    if (url) urls.add(url);
  }
}

for (const url of [...urls].sort()) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const schema = await res.json();
  const file = schemaFile(url);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`${url} → ${file.slice(file.indexOf("schemas/"))}`);
}
