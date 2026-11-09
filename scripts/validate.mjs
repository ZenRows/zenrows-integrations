// Checks what each host ships: skill frontmatter, skill references, manifests
// (against the JSON Schema they declare), the marketplace catalogs at the top of
// the repo, and that no whole-file override was copied from an older shared file.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { catalogs, hostSkillName, hostSkills, hosts, listFiles, platformsDir, readLock, renderHost, root, sha256, skillNames, vars } from "./lib.mjs";

const errors = [];
const report = [];

// Every name a skill has anywhere: shared names, each host's own skills, and
// each host's name for them. A reference is only checked if it's one of these.
const knownSkills = new Set(skillNames());
for (const host of hosts()) {
  const values = vars(host);
  for (const { name } of hostSkills(host, values)) {
    knownSkills.add(name);
    knownSkills.add(hostSkillName(values, name));
  }
}

// Skill names a text refers to: "use map", every name inside "(use …)", and
// backticked names. One-word names count, so a plain "use map" is caught on a
// host that ships map as zenrows-map.
function skillReferences(text) {
  const refs = new Set();
  const add = (s) => {
    for (const [word] of s.matchAll(/(?<![\w-])[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\w-])/g)) if (knownSkills.has(word)) refs.add(word);
  };
  for (const [, word] of text.matchAll(/\buse (?:the )?`?([a-z][a-z0-9-]*)(?![\w-])/g)) add(word);
  for (const [, inner] of text.matchAll(/\(use ([^()]*)\)/g)) add(inner);
  for (const [, word] of text.matchAll(/`([a-z][a-z0-9-]*)`/g)) add(word);
  return refs;
}

// Shared skills and host skill text must write references as {{skill:name}},
// so a host that renames a skill gets its own name. Checked on the sources, so
// a plain name is caught even while no host renames anything.
const shared = skillNames();
const sources = [
  ...shared.map((n) => `skills/${n}/SKILL.md`),
  ...hosts().flatMap((h) => listFiles(join(platformsDir, h, "skills")).map((f) => `platforms/${h}/skills/${f}`)),
];
for (const file of sources) {
  const text = readFileSync(join(root, file), "utf8").replace(/\{\{\s*skill:[a-z0-9-]+\s*\}\}/g, "");
  const name = text.match(/^name: *([a-z][a-z0-9-]*) *$/m);
  if (name && shared.includes(name[1])) errors.push(`${file}: write name: {{skill:${name[1]}}}, not the plain name`);
  for (const ref of skillReferences(text)) {
    if (shared.includes(ref)) errors.push(`${file}: refers to the skill "${ref}" by its plain name; write {{skill:${ref}}}`);
  }
}

// JSON Schemas are downloaded from the URL a file declares in "$schema" and
// cached in .cache/schemas/ (git-ignored), so a local run downloads each once.
// Schema URLs are versioned (…/1.0.0/plugin.schema.json), so a cached copy stays valid.
async function loadSchemas() {
  const urls = new Set();
  for (const host of hosts()) {
    const tops = catalogs()
      .filter((c) => c.host === host && existsSync(join(root, c.file)))
      .map(({ file }) => [file, readFileSync(join(root, file))]);
    for (const [file, buf] of [...renderHost(host), ...tops]) {
      if (!file.endsWith(".json")) continue;
      try {
        const url = JSON.parse(buf.toString("utf8")).$schema;
        if (url) urls.add(url);
      } catch {
        // Invalid JSON is reported below, with the file it's in.
      }
    }
  }
  const loaded = new Map();
  for (const url of urls) {
    const { hostname, pathname } = new URL(url);
    const cached = join(root, ".cache", "schemas", hostname, pathname);
    try {
      if (!existsSync(cached)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        JSON.parse(text);
        mkdirSync(dirname(cached), { recursive: true });
        writeFileSync(cached, text);
      }
      loaded.set(url, JSON.parse(readFileSync(cached, "utf8")));
    } catch (e) {
      loaded.set(url, new Error(`couldn't download ${url} (${e.cause?.code ?? e.message})`));
    }
  }
  return loaded;
}

const schemas = await loadSchemas();
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map();
function schemaErrors(url, json) {
  const schema = schemas.get(url);
  if (schema instanceof Error) return [`can't be checked against its schema: ${schema.message}`];
  if (!validators.has(url)) validators.set(url, ajv.compile(schema));
  const check = validators.get(url);
  return check(json) ? [] : check.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
}

// Parses a JSON file and checks it against its "$schema". Returns the JSON, or
// undefined after recording an error.
// OpenAI declares OAuth under mcpServers.<name>.extensions["com.openai"], as its
// docs show, but the Agent Plugins MCP schema doesn't list "extensions" on a
// server. Check the rest of the file against the schema.
function withoutServerExtensions(json) {
  if (!json.mcpServers || typeof json.mcpServers !== "object") return json;
  const servers = Object.fromEntries(Object.entries(json.mcpServers).map(([name, { extensions, ...server }]) => [name, server]));
  return { ...json, mcpServers: servers };
}

function readJson(host, file, buf) {
  let json;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    errors.push(`${host}: ${file} is not valid JSON (${e.message})`);
    return undefined;
  }
  if (json.$schema) {
    for (const problem of schemaErrors(json.$schema, withoutServerExtensions(json))) errors.push(`${host}: ${file} ${problem}`);
  }
  return json;
}

for (const host of hosts()) {
  const files = renderHost(host);
  const values = vars(host);
  const own = hostSkills(host, values);
  const shipped = new Set(own.map((s) => hostSkillName(values, s.name)));

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

    // References to other skills ("use map", "(use map or crawl)", "the `map`
    // skill") must name a skill this host ships, under its name on this host.
    for (const ref of skillReferences(text)) {
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

  // A mirror repo installs through the host's marketplace catalog, rewritten
  // to point at the mirror's root, so a mirrored host needs one.
  if (values.mirror !== undefined) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(String(values.mirror))) {
      errors.push(`${host}: vars.yaml mirror: is "${values.mirror}", expected <owner>/<repo>`);
    }
    if (!catalogs().some((c) => c.host === host)) {
      errors.push(`${host}: vars.yaml sets mirror:, but ${host} has no marketplace catalog for the mirror to carry (see CONTRIBUTING.md)`);
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
    if (!existsSync(join(root, shared))) continue; // a skill only this host has, not an override
    if (!(shared in lock)) errors.push(`${host}: platforms/${host}/skills/${file} overrides ${shared} but isn't in overrides.lock (use npm run override)`);
  }

  // Placeholders left by npm run new-host.
  for (const file of listFiles(join(platformsDir, host))) {
    const text = readFileSync(join(platformsDir, host, file), "utf8");
    if (text.includes("TODO(new-host)")) errors.push(`${host}: platforms/${host}/${file} still has a TODO(new-host)`);
  }

  // platforms/<host>/scripts/ is the host's tooling and never ships, so only the
  // two files the repo runs belong there.
  for (const file of listFiles(join(platformsDir, host, "scripts"))) {
    if (!["validate.mjs", "package.sh"].includes(file)) {
      errors.push(`${host}: platforms/${host}/scripts/${file} isn't shipped (scripts/ holds only validate.mjs and package.sh); move plugin files elsewhere`);
    }
  }

  // Checks only one host needs, such as OpenAI's submission limits, live in
  // platforms/<host>/scripts/validate.mjs and run on the committed dist/<host>.
  const extra = join(platformsDir, host, "scripts", "validate.mjs");
  if (existsSync(extra)) {
    const run = spawnSync(process.execPath, [extra, join(root, "dist", host)], { encoding: "utf8" });
    if (run.status !== 0) errors.push(`${host}: platforms/${host}/scripts/validate.mjs failed:\n${(run.stderr || run.stdout).trim()}`);
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
