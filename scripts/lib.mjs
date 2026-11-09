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

// Files copied into every host's plugin as they are.
const sharedFiles = { LICENSE: "LICENSE" };
const sharedDirs = { "shared/assets": "assets" };
// In platforms/<host>/, these are inputs to the render, not files of the plugin.
// Everything else there (manifests, README, …) is copied into dist/<host>/.
const reserved = ["vars.yaml", "overrides.lock", "skills/"];
// {{vars}} are filled in files with these extensions; others are copied as bytes.
const textFile = /\.(json|md|mdc|ya?ml|txt|toml)$/;

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
  const version = versions()[`dist/${host}`];
  if (!version) throw new Error(`.release-please-manifest.json has no "dist/${host}" entry`);
  return { ...v, version };
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

// A skill's name on a host: skill_prefix + the shared name, unless vars.yaml
// renames it in skill_names (OpenClaw ships scrape-webpage as zenrows-scrape).
export function hostSkillName(values, name) {
  return values.skill_names?.[name] ?? `${values.skill_prefix ?? ""}${name}`;
}

// {{name}} is a variable from vars.yaml; {{skill:name}} is that skill's name on the host.
function fill(text, values, where) {
  return text.replace(/\{\{\s*([a-z_]+)(?::([a-z0-9-]+))?\s*\}\}/g, (token, name, arg) => {
    if (name === "skill") {
      if (!values.skills.includes(arg)) {
        const why = skillNames().includes(arg) ? "this host skips it (skip_skills)" : "there's no such skill";
        throw new Error(`${where}: ${token} names a skill this host doesn't ship: ${why}`);
      }
      return hostSkillName(values, arg);
    }
    if (arg !== undefined || !(name in values) || typeof values[name] === "object") {
      throw new Error(`${where}: unknown variable ${token}`);
    }
    return String(values[name]);
  });
}

// Renders one host. Returns Map<path under dist/<host>, Buffer>.
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
    // {{> slot}} needs platforms/<host>/skills/<skill>/<slot>.md. {{>? slot}} is
    // optional: without the file, its line (and one blank line after it) goes.
    let text = readFileSync(source, "utf8")
      .replace(/^[ \t]*\{\{>\?\s*([a-z0-9_-]+)\s*\}\}[ \t]*\n(\n)?/gm, (line, slot) =>
        existsSync(join(platform, "skills", name, `${slot}.md`)) ? line : "",
      )
      .replace(/\{\{>(\?)?\s*([a-z0-9_-]+)\s*\}\}/g, (_, optional, slot) => {
        const file = join(platform, "skills", name, `${slot}.md`);
        if (!existsSync(file)) {
          if (optional) return "";
          throw new Error(`${where}: slot {{> ${slot}}} has no ${relative(root, file)}`);
        }
        usedSlots.add(relative(root, file));
        return readFileSync(file, "utf8").replace(/\n$/, "");
      });
    text = fill(text, values, where);
    out.set(`skills/${hostSkillName(values, name)}/SKILL.md`, Buffer.from(text));
  }

  for (const file of listFiles(join(platform, "skills"))) {
    const path = relative(root, join(platform, "skills", file));
    if (file.endsWith("/SKILL.md")) continue;
    if (!usedSlots.has(path)) throw new Error(`${path}: no skill this host ships has this slot`);
  }

  for (const [from, to] of Object.entries(sharedFiles)) out.set(to, readFileSync(join(root, from)));
  for (const [from, to] of Object.entries(sharedDirs)) {
    for (const file of listFiles(join(root, from))) out.set(`${to}/${file}`, readFileSync(join(root, from, file)));
  }
  for (const file of listFiles(platform)) {
    if (reserved.some((r) => file === r || file.startsWith(r))) continue;
    out.set(file, renderFile(join(platform, file), values));
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
