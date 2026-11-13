// Shared by render.mjs, validate.mjs and override.mjs: where things live, how a
// host's plugin is rendered, and how override hashes are computed.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const skillsDir = join(root, "skills");
export const platformsDir = join(root, "platforms");
export const distDir = join(root, "dist");
export const sharedTextDir = join(root, "shared", "text");

// Files copied into every host's plugin as they are.
const sharedFiles = { LICENSE: "LICENSE" };
const sharedDirs = { "shared/assets": "assets" };
// In platforms/<host>/, these are inputs to the render, not files of the plugin.
// Everything else there (manifests, README, …) is copied into dist/<host>/.
const reserved = ["vars.yaml", "overrides.lock", "skills/", "readme/"];
// A plugin host's README.md is rendered from this template, with the host's
// slots from platforms/<host>/readme/.
const readmeTemplate = join(root, "shared", "README.md");
// What's left of one of this tool's tokens ({{name}}, {{skill:x}}, {{text:x}},
// {{< x}}, {{> x}}) after the render, for example in a file type it doesn't
// fill, or with a stray space, capital letter, _ or . the fill regexes don't
// take. A colon is ours only after skill or text, so JSX's style={{ flex: 1 }}
// isn't matched; nor is other tools' {{…}} (Make's {{a.b}}, n8n's {{ $json.x }}),
// which ships as written. scripts/test.mjs lists both sides.
export const leftoverToken = /\{\{\s*(?:[<>]\??\s*[a-z0-9_.-]+|(?:skill|text)\s*:\s*[a-z0-9_.-]+|[a-z_][a-z0-9_-]*)\s*\}\}/i;
// {{vars}} are filled in files with these extensions; others are copied as bytes.
export const textFile = /\.(json|md|mdc|ya?ml|txt|toml|[cm]?[jt]s)$/;

// Errors here are for whoever edited a skill or platform file: print the
// message, not a stack trace.
process.on("uncaughtException", (e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function hosts() {
  return readdirSync(platformsDir).filter((d) => statSync(join(platformsDir, d)).isDirectory()).sort();
}

export function skillNames() {
  return readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md"))).sort();
}

export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && !f.endsWith(".DS_Store"))
    .map((f) => relative(dir, f))
    .sort();
}

function versions() {
  return JSON.parse(readFileSync(join(root, ".release-please-manifest.json"), "utf8"));
}

export function vars(host) {
  const v = parseYaml(readFileSync(join(platformsDir, host, "vars.yaml"), "utf8")) ?? {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`platforms/${host}/vars.yaml must be a list of name: value lines`);
  if ("kind" in v && v.kind !== "plugin" && v.kind !== "code") {
    throw new Error(`platforms/${host}/vars.yaml: kind is ${JSON.stringify(v.kind)}; use plugin or code`);
  }
  const version = versions()[`dist/${host}`];
  // A code host may not be released from here (yet), so it needs no
  // release-please entry; it then has no {{version}}.
  if (!version && !isCodeHost(v)) throw new Error(`.release-please-manifest.json has no "dist/${host}" entry`);
  return version ? { ...v, version } : v;
}

// overrides.lock: "<shared path>: <sha256>" per line; # starts a comment.
export function readLock(host) {
  const file = join(platformsDir, host, "overrides.lock");
  if (!existsSync(file)) return {};
  return parseYaml(readFileSync(file, "utf8")) ?? {};
}

// The skills a host ships: the shared skills minus vars.yaml's skip_skills, plus
// the host's own skills (platforms/<host>/skills/<name>/SKILL.md with no shared
// skill of that name). Returns [{ name, own }].
export function hostSkills(host, values = vars(host)) {
  // A code host (kind: code) ships no skills, so a skills/ folder there would be ignored.
  if (isCodeHost(values)) {
    if (listFiles(join(platformsDir, host, "skills")).length) {
      throw new Error(`platforms/${host}/skills/: a code host (kind: code) ships no skills; move these files out of skills/`);
    }
    return [];
  }
  const shared = skillNames();
  const skip = values.skip_skills ?? [];
  for (const name of skip) {
    if (!shared.includes(name)) throw new Error(`platforms/${host}/vars.yaml: skip_skills lists "${name}", which isn't in skills/`);
  }
  const own = listFiles(join(platformsDir, host, "skills"))
    .filter((f) => /^[^/]+\/SKILL\.md$/.test(f))
    .map((f) => f.split("/")[0])
    .filter((name) => !shared.includes(name));
  return [
    ...shared.filter((name) => !skip.includes(name)).map((name) => ({ name, own: false })),
    ...own.map((name) => ({ name, own: true })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

// kind: code in vars.yaml marks a host whose output isn't a plugin but files for
// somewhere else (code for another project, a listing a marketplace reads): it
// ships only its own files, with {{…}} filled in, and no shared skills, LICENSE
// or assets.
export function isCodeHost(values) {
  // vars() has already rejected any other kind, naming the file.
  return values.kind === "code";
}

// A skill's name on a host: skill_prefix + the shared name, unless vars.yaml
// renames it in skill_names (OpenClaw ships scrape-webpage as zenrows-scrape).
export function hostSkillName(values, name) {
  return values.skill_names?.[name] ?? `${values.skill_prefix ?? ""}${name}`;
}

// shared/text/<name>.md: one fact in plain text, used by skills and by code
// hosts alike, so a wording fix reaches both.
export function sharedText(name, where) {
  const file = join(sharedTextDir, `${name}.md`);
  if (!existsSync(file)) throw new Error(`${where}: there's no shared/text/${name}.md`);
  // Trimmed, so a trailing blank line or a CRLF ending doesn't end up in a string.
  const text = readFileSync(file, "utf8").trim();
  if (text.includes("{{")) {
    throw new Error(`shared/text/${name}.md uses {{…}}; a snippet is a plain fact, and the text around it adds what differs per host`);
  }
  return text;
}

// {{name}} is a variable from vars.yaml; {{skill:name}} is that skill's name on
// the host; {{< name}} inlines shared/text/<name>.md, and {{text:name}} inserts it
// as a quoted string literal (JSON), for code.
function fill(text, values, where) {
  text = text.replace(/\{\{<\s*([a-z0-9-]+)\s*\}\}/g, (_, name) => sharedText(name, where));
  return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)(?::([a-z0-9-]+))?\s*\}\}/g, (token, name, arg) => {
    if (name === "skill") {
      if (!values.skills.includes(arg)) {
        const why = !skillNames().includes(arg)
          ? "there's no such skill"
          : isCodeHost(values)
            ? "a code host (kind: code) ships no skills"
            : "this host skips it (skip_skills)";
        throw new Error(`${where}: ${token} names a skill this host doesn't ship: ${why}`);
      }
      return hostSkillName(values, arg);
    }
    if (name === "text" && arg !== undefined) return JSON.stringify(sharedText(arg, where));
    if (arg !== undefined || !(name in values) || typeof values[name] === "object") {
      throw new Error(`${where}: unknown variable ${token}`);
    }
    return String(values[name]);
  });
}

// Renders one host. Returns Map<path under dist/<host>, Buffer>.
// Puts a host's slot files into text: {{> slot}} needs <dir>/<slot>.md; {{>? slot}}
// is optional, and without the file its line (and one blank line after it) goes.
// Records each slot file used in usedSlots.
function fillSlots(text, dir, where, usedSlots) {
  return text
    .replace(/^[ \t]*\{\{>\?\s*([a-z0-9_-]+)\s*\}\}[ \t]*\n(\n)?/gm, (line, slot) => (existsSync(join(dir, `${slot}.md`)) ? line : ""))
    .replace(/\{\{>(\?)?\s*([a-z0-9_-]+)\s*\}\}/g, (_, optional, slot) => {
      const file = join(dir, `${slot}.md`);
      if (!existsSync(file)) {
        if (optional) return "";
        throw new Error(`${where}: slot {{> ${slot}}} has no ${relative(root, file)}`);
      }
      usedSlots.add(relative(root, file));
      return readFileSync(file, "utf8").replace(/\n$/, "");
    });
}

export function renderHost(host) {
  const values = vars(host);
  const skills = hostSkills(host, values);
  values.skills = skills.map((s) => s.name);
  const platform = join(platformsDir, host);
  const out = new Map();
  const usedSlots = new Set();

  for (const { name } of skills) {
    // The host's own copy: a skill only this host has, or a whole-file override.
    const own = join(platform, "skills", name, "SKILL.md");
    const source = existsSync(own) ? own : join(skillsDir, name, "SKILL.md");
    const where = relative(root, source);
    let text = fillSlots(readFileSync(source, "utf8"), join(platform, "skills", name), where, usedSlots);
    text = fill(text, values, where);
    out.set(`skills/${hostSkillName(values, name)}/SKILL.md`, Buffer.from(text));
  }

  for (const file of listFiles(join(platform, "skills"))) {
    const path = relative(root, join(platform, "skills", file));
    if (file.endsWith("/SKILL.md")) continue;
    if (!usedSlots.has(path)) throw new Error(`${path}: no skill this host ships has this slot`);
  }

  if (!isCodeHost(values)) {
    if (existsSync(join(platform, "README.md"))) {
      throw new Error(`platforms/${host}/README.md: a plugin's README comes from shared/README.md; put the host's own text in platforms/${host}/readme/setup.md (and readme/more.md)`);
    }
    const where = relative(root, readmeTemplate);
    out.set("README.md", Buffer.from(fill(fillSlots(readFileSync(readmeTemplate, "utf8"), join(platform, "readme"), where, usedSlots), values, where)));
    for (const file of listFiles(join(platform, "readme"))) {
      const path = relative(root, join(platform, "readme", file));
      if (!usedSlots.has(path)) throw new Error(`${path}: shared/README.md has no slot for it`);
    }
  }

  for (const [from, to] of isCodeHost(values) ? [] : Object.entries(sharedFiles)) out.set(to, readFileSync(join(root, from)));
  for (const [from, to] of isCodeHost(values) ? [] : Object.entries(sharedDirs)) {
    for (const file of listFiles(join(root, from))) out.set(`${to}/${file}`, readFileSync(join(root, from, file)));
  }
  for (const file of listFiles(platform)) {
    if (reserved.some((r) => file === r || file.startsWith(r))) continue;
    // A code host's README documents the integration here; it isn't part of the code.
    if (isCodeHost(values) && file === "README.md") continue;
    out.set(file, renderFile(join(platform, file), values));
  }

  // A token the render didn't fill (a mistyped one, or in a file type outside
  // textFile) would otherwise ship as it is. Binary files (not valid UTF-8) are skipped.
  for (const [path, buf] of out) {
    const text = buf.toString("utf8");
    const token = Buffer.from(text, "utf8").equals(buf) && text.match(leftoverToken);
    if (token) {
      throw new Error(`${host}: ${path} still has an unrendered ${token[0]}`);
    }
  }
  return out;
}

// Marketplace catalogs at the top of the repo (for example Copilot's
// .github/plugin/marketplace.json), which point a host at ./dist/<host>. They are
// normal files, not rendered; release-please bumps their version, so they're
// the extra-files with a leading "/" in release-please-config.json.
// Returns [{ host, file }] with file relative to the repo root.
export function catalogs() {
  const config = JSON.parse(readFileSync(join(root, "release-please-config.json"), "utf8"));
  const found = new Map();
  for (const [pkg, settings] of Object.entries(config.packages ?? {})) {
    const host = pkg.replace(/^dist\//, "");
    for (const extra of settings["extra-files"] ?? []) {
      const path = typeof extra === "string" ? extra : extra.path;
      if (path.startsWith("/")) found.set(`${host} ${path}`, { host, file: path.slice(1) });
    }
  }
  return [...found.values()];
}

// A host with mirror: <owner/repo> in vars.yaml is also published to that repo,
// whose root is dist/<host>/ plus the host's marketplace catalogs, if it has
// any (see catalogs()), at the same paths, listing only this host with source
// "./" (the mirror's root), and a banner under README.md's title pointing back here.
// The banner names the release tag, or for a sync with no tag, the commit.
// Reads the committed files, which render --check and validate keep current.
// Returns Map<path, Buffer>.
export function renderMirror(host, { tag, sha } = {}) {
  if (!tag && !sha) throw new Error("renderMirror needs the release tag or the source commit");
  const values = vars(host);
  if (!values.mirror) throw new Error(`platforms/${host}/vars.yaml has no mirror: <owner/repo>`);
  const out = new Map();
  for (const file of listFiles(join(distDir, host))) out.set(file, readFileSync(join(distDir, host, file)));
  for (const { file } of catalogs().filter((c) => c.host === host)) {
    const catalog = JSON.parse(readFileSync(join(root, file), "utf8"));
    catalog.plugins = (catalog.plugins ?? [])
      .filter((p) => p.source === `./dist/${host}`)
      .map((p) => ({ ...p, source: "./" }));
    out.set(file, Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`));
  }
  if (out.has("README.md")) {
    const banner =
      `> Generated from [ZenRows/zenrows-integrations](https://github.com/ZenRows/zenrows-integrations/tree/main/dist/${host}), ` +
      `${tag ? `released as ${tag}` : `synced from main at ${sha.slice(0, 7)}`}. ` +
      `Open issues and pull requests there; changes made here are overwritten.`;
    const readme = out.get("README.md").toString("utf8");
    const title = readme.match(/^# .*\n/);
    const at = title ? title[0].length : 0;
    out.set("README.md", Buffer.from(`${readme.slice(0, at)}${title ? "\n" : ""}${banner}\n\n${readme.slice(at).replace(/^\n/, "")}`));
  }
  return out;
}

function renderFile(path, values) {
  if (!textFile.test(path)) return readFileSync(path);
  return Buffer.from(fill(readFileSync(path, "utf8"), values, relative(root, path)));
}
