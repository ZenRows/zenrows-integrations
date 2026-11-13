// Checks what each host ships: skill frontmatter, skill references, manifests
// (against the JSON Schema they declare), the marketplace catalogs at the top of
// the repo, and that no whole-file override was copied from an older shared file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { catalogs, hostSkillName, hostSkills, hosts, isCodeHost, listFiles, platformsDir, readLock, renderHost, root, sha256, sharedTextDir, skillNames, textFile, vars } from "./lib.mjs";

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
function readJson(host, file, buf) {
  let json;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    errors.push(`${host}: ${file} is not valid JSON (${e.message})`);
    return undefined;
  }
  if (json.$schema) {
    for (const problem of schemaErrors(json.$schema, json)) errors.push(`${host}: ${file} ${problem}`);
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
  if (!manifests.length && !isCodeHost(values)) errors.push(`${host}: no plugin.json in platforms/${host}/`);

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

  // Every released host says whether its releases are uploaded somewhere by
  // hand, so the release workflow knows whether to post a reminder. A host with
  // no release-please entry (a code host not released from here) never gets a
  // tag, so a reminder could never fire for it.
  const upload = values.upload;
  if (values.version === undefined) {
    if (upload !== undefined && upload !== false) {
      errors.push(`${host}: vars.yaml sets upload:, but ${host} has no release, so an upload reminder can never fire`);
    }
  } else if (upload === undefined) {
    errors.push(`${host}: vars.yaml has no upload: (false, or to: and url:; see CONTRIBUTING.md)`);
  } else if (
    upload !== false &&
    // The reminder links them as Slack's <url|to>, which a space, <, > or | would cut short.
    !(typeof upload?.to === "string" && upload.to.trim() && !/[<>|]/.test(upload.to) && typeof upload.url === "string" && /^https:\/\/[^\s<>|]+$/.test(upload.url))
  ) {
    errors.push(`${host}: vars.yaml upload: must be false, or to: <where> and url: <https:// link>, without spaces in the link or <, > or | in either`);
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

  // A code host's README stays here (it isn't shipped) and the repo's hosts
  // list links to it.
  if (isCodeHost(values)) {
    if (!existsSync(join(platformsDir, host, "README.md"))) {
      errors.push(`${host}: a code host needs platforms/${host}/README.md; the hosts list in README.md links to it`);
    }
    report.push(`${host}: code host, ships only its own files`);
    continue;
  }

  // How much skill text the host owns instead of sharing: its slot files and
  // whole-file overrides. Information only; a growing number is worth a look.
  const owned = listFiles(join(platformsDir, host, "skills"))
    .map((f) => readFileSync(join(platformsDir, host, "skills", f), "utf8").split("\n").filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  report.push(`${host}: ${Object.keys(lock).length} whole-file overrides, ${owned} skill lines of its own (slots and overrides)`);
}

// shared/text/ snippets are plain text, so they read the same in a skill and in
// a code string, and each must be used somewhere ({{< name}} or {{text:name}}).
// A code host's README isn't rendered, and vars.yaml and overrides.lock are
// inputs, so a snippet named only there isn't used.
const codeHostReadmes = hosts().filter((h) => isCodeHost(vars(h))).map((h) => `${h}/README.md`);
const snippetSources = [
  join(root, "shared", "README.md"),
  ...skillNames().map((n) => join(root, "skills", n, "SKILL.md")),
  ...listFiles(platformsDir)
    .filter((f) => !codeHostReadmes.includes(f) && !/\/(vars\.yaml|overrides\.lock)$/.test(f))
    .map((f) => join(platformsDir, f)),
];
const used = new Set();
for (const file of snippetSources) {
  if (!textFile.test(file)) continue;
  for (const [, , name] of readFileSync(file, "utf8").matchAll(/\{\{(<\s*|\s*text:)([a-z0-9-]+)\s*\}\}/g)) used.add(name);
}
for (const file of listFiles(sharedTextDir)) {
  const name = file.replace(/\.md$/, "");
  const text = readFileSync(join(sharedTextDir, file), "utf8");
  if (!used.has(name)) errors.push(`shared/text/${file} isn't used by any skill or host`);
  // Backticks, *, links and headings would show up as is in a code string.
  // _ and [ ] don't count: parameter names (js_render) and [{...}] use them.
  if (/[`*]/.test(text) || /\]\(/.test(text) || /^#/.test(text.trim())) errors.push(`shared/text/${file} has markdown; keep snippets plain text so code can use them`);
  if (text.trim().includes("\n")) errors.push(`shared/text/${file} has more than one line; keep one fact per snippet`);
  // A copy of the fact written out would miss the next change to it.
  for (const source of snippetSources) {
    if (readFileSync(source, "utf8").includes(text.trim())) {
      errors.push(`${relative(root, source)} writes out shared/text/${file}; use {{< ${name}}} (or {{text:${name}}} in code) instead`);
    }
  }
}

console.log(report.join("\n"));
if (errors.length) {
  console.error(`\n${errors.map((e) => `❌ ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("All hosts valid.");
