// Checks what each host ships: skill frontmatter, skill references, manifests
// (against the JSON Schema they declare), the marketplace catalogs at the top of
// the repo, and that no whole-file override was copied from an older shared file.
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { catalogs, hostSkillName, hosts, listFiles, platformsDir, readLock, renderHost, root, schemaFile, sha256, skillNames, vars } from "./lib.mjs";

const errors = [];
const report = [];

// Schemas are read from schemas/ (npm run fetch-schemas), so CI needs no network.
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map();
function schemaErrors(url) {
  if (!validators.has(url)) {
    const file = schemaFile(url);
    if (!existsSync(file)) return [`declares ${url}, which isn't in schemas/ (run npm run fetch-schemas and commit it)`];
    validators.set(url, ajv.compile(JSON.parse(readFileSync(file, "utf8"))));
  }
  const check = validators.get(url);
  return (json) => (check(json) ? [] : check.errors.map((e) => `${e.instancePath || "/"} ${e.message}`));
}

// Parses a JSON file and checks it against its "$schema". Returns the JSON, or
// undefined after recording an error.
function readJson(host, file, buf) {
  let json;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    errors.push(`${host}: ${file} is not valid JSON (${e.message})`);
    return undefined;
  }
  if (json.$schema) {
    const check = schemaErrors(json.$schema);
    for (const problem of Array.isArray(check) ? check : check(json)) errors.push(`${host}: ${file} ${problem}`);
  }
  return json;
}

for (const host of hosts()) {
  const files = renderHost(host);
  const values = vars(host);
  const shipped = new Set(skillNames().map((n) => hostSkillName(values, n)));

  for (const [path, buf] of files) {
    const m = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (!m) continue;
    const text = buf.toString("utf8");
    const front = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!front) {
      errors.push(`${host}: ${path} has no frontmatter`);
      continue;
    }
    const meta = parseYaml(front[1]) ?? {};
    if (!meta.description) errors.push(`${host}: ${path} has no description`);
    if (meta.name !== m[1]) errors.push(`${host}: ${path} is named "${meta.name}", expected "${m[1]}"`);

    // References to other skills: "use scrape-webpage", "the `map` skill" and
    // the backticked list after "skills:".
    const refs = new Set();
    for (const r of text.matchAll(/\buse ([a-z]+(?:-[a-z]+)+)\b/g)) refs.add(r[1]);
    for (const r of text.matchAll(/`([a-z][a-z0-9-]*)` skill\b/g)) refs.add(r[1]);
    for (const line of text.split("\n").filter((l) => /\bskills: `/.test(l))) {
      for (const r of line.matchAll(/`([a-z][a-z0-9-]*)`/g)) refs.add(r[1]);
    }
    for (const ref of refs) {
      if (!shipped.has(ref)) errors.push(`${host}: ${path} refers to skill "${ref}", which ${host} doesn't ship`);
    }
  }

  // Every JSON file must parse, wherever the host keeps it; the plugin manifest
  // (plugin.json, at the root or in a folder such as .claude-plugin/) needs the
  // fields every host reads.
  const manifests = [];
  for (const [file, buf] of [...files].filter(([f]) => f.endsWith(".json"))) {
    const json = readJson(host, file, buf);
    if (!json || basename(file) !== "plugin.json") continue;
    manifests.push(file);
    for (const key of ["name", "version", "description"]) {
      if (!json[key]) errors.push(`${host}: ${file} has no "${key}"`);
    }
  }
  if (!manifests.length) errors.push(`${host}: no plugin.json in platforms/${host}/`);

  // Marketplace catalogs at the top of the repo must point at this host's
  // dist/ folder, with this host's version.
  for (const { file } of catalogs().filter((c) => c.host === host)) {
    if (!existsSync(join(root, file))) {
      errors.push(`${host}: release-please-config.json lists ${file}, which doesn't exist`);
      continue;
    }
    const json = readJson(host, file, readFileSync(join(root, file)));
    const entry = json?.plugins?.find((p) => p.source === `./dist/${host}`);
    if (!json) continue;
    if (!entry) errors.push(`${host}: ${file} has no plugin with source "./dist/${host}"`);
    for (const [where, version] of [["metadata.version", json.metadata?.version], ["the plugin's version", entry?.version]]) {
      if (version !== undefined && version !== values.version) {
        errors.push(`${host}: ${file} ${where} is ${version}, but .release-please-manifest.json says ${values.version}`);
      }
    }
  }

  // A whole-file override stops receiving fixes to the shared file it copied.
  const lock = readLock(host);
  for (const [shared, hash] of Object.entries(lock)) {
    const file = join(root, shared);
    if (!existsSync(file)) {
      errors.push(`${host}: overrides.lock lists ${shared}, which no longer exists`);
      continue;
    }
    const now = sha256(readFileSync(file)).slice(0, 12);
    if (now !== hash) {
      const skill = shared.split("/")[1];
      errors.push(
        `${shared} changed (${hash} → ${now}), but platforms/${host} overrides it.\n` +
          `   Apply the change to the ${host} copy if it's relevant, then run: npm run override:ack -- ${host} ${skill}`,
      );
    }
  }
  for (const file of listFiles(join(platformsDir, host, "skills")).filter((f) => f.endsWith("/SKILL.md"))) {
    const shared = `skills/${file}`;
    if (!(shared in lock)) errors.push(`${host}: platforms/${host}/skills/${file} overrides ${shared} but isn't in overrides.lock (use npm run override)`);
  }

  // Placeholders left by npm run new-host.
  for (const file of listFiles(join(platformsDir, host))) {
    const text = readFileSync(join(platformsDir, host, file), "utf8");
    if (text.includes("TODO(new-host)")) errors.push(`${host}: platforms/${host}/${file} still has a TODO(new-host)`);
  }

  // How much skill text the host owns instead of sharing: its slot files and
  // whole-file overrides. Information only; a growing number is worth a look.
  const owned = listFiles(join(platformsDir, host, "skills"))
    .map((f) => readFileSync(join(platformsDir, host, "skills", f), "utf8").split("\n").filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  report.push(`${host}: ${Object.keys(lock).length} whole-file overrides, ${owned} skill lines of its own (slots and overrides)`);
}

console.log(report.join("\n"));
if (errors.length) {
  console.error(`\n${errors.map((e) => `❌ ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("All hosts valid.");
