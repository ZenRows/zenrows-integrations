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

// A skill's name on a host: skill_prefix + the shared name, unless vars.yaml
// renames it in skill_names (OpenClaw ships scrape-webpage as zenrows-scrape).
export function hostSkillName(values, name) {
  return values.skill_names?.[name] ?? `${values.skill_prefix ?? ""}${name}`;
}

// {{name}} is a variable from vars.yaml; {{skill:name}} is that skill's name on the host.
function fill(text, values, where) {
  return text.replace(/\{\{\s*([a-z_]+)(?::([a-z0-9-]+))?\s*\}\}/g, (token, name, arg) => {
    if (name === "skill") {
      if (!skillNames().includes(arg)) throw new Error(`${where}: ${token} names no skill in skills/`);
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
  const platform = join(platformsDir, host);
  const out = new Map();
  const usedSlots = new Set();

  for (const name of skillNames()) {
    const override = join(platform, "skills", name, "SKILL.md");
    const source = existsSync(override) ? override : join(skillsDir, name, "SKILL.md");
    const where = relative(root, source);
    let text = readFileSync(source, "utf8").replace(/\{\{>\s*([a-z0-9_-]+)\s*\}\}/g, (_, slot) => {
      const file = join(platform, "skills", name, `${slot}.md`);
      if (!existsSync(file)) throw new Error(`${where}: slot {{> ${slot}}} has no ${relative(root, file)}`);
      usedSlots.add(relative(root, file));
      return readFileSync(file, "utf8").replace(/\n$/, "");
    });
    text = fill(text, values, where);
    out.set(`skills/${hostSkillName(values, name)}/SKILL.md`, Buffer.from(text));
  }

  for (const file of listFiles(join(platform, "skills"))) {
    const path = relative(root, join(platform, "skills", file));
    if (file.endsWith("/SKILL.md")) continue;
    if (!usedSlots.has(path)) throw new Error(`${path}: no shared skill has this slot`);
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

function renderFile(path, values) {
  if (!textFile.test(path)) return readFileSync(path);
  return Buffer.from(fill(readFileSync(path, "utf8"), values, relative(root, path)));
}
