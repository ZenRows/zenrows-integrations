#!/usr/bin/env node
// OpenAI-only checks, run by npm run validate on dist/openai (and by package.sh): the limits OpenAI
// documents for public plugin submission, so a bad field fails here instead of
// in the submission portal. Moved from openai-zenrows' scripts/validate.mjs.
// Sources: https://developers.openai.com/plugins/deploy/submission (Manifest fields)
//          https://developers.openai.com/plugins/deploy/submission-errors
//          https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const errors = [];
const fail = (msg) => errors.push(msg);

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (e) {
    fail(`${rel}: ${e.message}`);
    return null;
  }
}

const isString = (v) => typeof v === "string";
const isHttps = (v) => isString(v) && /^https:\/\/[^\s@]+$/.test(v);

function text(path, value, { max, required = true, oneLine = false } = {}) {
  if (value === undefined) {
    if (required) fail(`${path} is required`);
    return;
  }
  if (!isString(value) || value.trim() === "") return fail(`${path} must be a non-empty string`);
  if (max && value.length > max) fail(`${path} is ${value.length} characters; the limit is ${max}`);
  if (oneLine && /[\r\n]/.test(value)) fail(`${path} must fit on one line`);
  if (value.includes("—")) fail(`${path} contains an em dash`);
}

function url(path, value, max) {
  if (!isHttps(value)) return fail(`${path} must be an HTTPS URL`);
  if (value.length > max) fail(`${path} is longer than ${max} characters`);
}

// Image rules: PNG, JPEG, WebP or SVG, at most 5 MiB, square, 48 px to 4096 px.
function image(path, rel) {
  if (!isString(rel) || !rel.startsWith("./")) return fail(`${path} must be a ./-relative path`);
  const file = join(root, rel);
  if (!existsSync(file)) return fail(`${path}: ${rel} does not exist`);
  const buf = readFileSync(file);
  if (buf.length > 5 * 1024 * 1024) fail(`${path}: ${rel} is larger than 5 MiB`);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w !== h) fail(`${path}: ${rel} is ${w}x${h}; icons must be square`);
    if (w < 48 || w > 4096) fail(`${path}: ${rel} is ${w}px; icons must be 48 to 4096 px`);
  } else if (!/\.(jpe?g|webp|svg)$/i.test(rel)) {
    fail(`${path}: ${rel} must be PNG, JPEG, WebP or SVG`);
  }
}

// --- plugin.json -----------------------------------------------------------------
const ROOT_KEYS = ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"];
const plugin = readJson("plugin.json");
if (plugin) {
  for (const key of Object.keys(plugin)) if (!ROOT_KEYS.includes(key)) fail(`plugin.json: unknown root field ${key}`);
  if (plugin.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") fail("plugin.json: $schema must be the Agent Plugins 1.0.0 schema");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin.name ?? "") || plugin.name.length > 64)
    fail("plugin.json: name must be lowercase letters, numbers and single hyphens, at most 64 characters");
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? "")) fail("plugin.json: version must be a semantic version such as 1.0.0");
  text("plugin.json description", plugin.description, { max: 4000 });
  text("author.name", plugin.author?.name, { max: 120 });
  if (plugin.author?.url !== undefined) url("author.url", plugin.author.url, 2048);

  const openai = plugin.extensions?.["com.openai"];
  if (!openai) fail("plugin.json: extensions.com.openai is required for the listing");
  else {
    for (const key of ["apps", "hooks"]) if (key in openai) fail(`extensions.com.openai.${key}: packages with ${key} cannot be submitted`);

    const ui = openai.interface ?? {};
    text("interface.displayName", ui.displayName, { max: 30, oneLine: true });
    text("interface.shortDescription", ui.shortDescription, { max: 30, oneLine: true });
    text("interface.longDescription", ui.longDescription, { max: 4000 });
    text("interface.developerName", ui.developerName, { max: 80, oneLine: true });
    text("interface.category", ui.category, { oneLine: true });
    for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) url(`interface.${key}`, ui[key], 1024);
    if (ui.capabilities !== undefined) {
      if (!Array.isArray(ui.capabilities) || ui.capabilities.length > 20) fail("interface.capabilities: at most 20 labels");
      else ui.capabilities.forEach((c, i) => text(`interface.capabilities[${i}]`, c, { max: 120, oneLine: true }));
    }
    if (ui.defaultPrompt !== undefined) {
      const prompts = Array.isArray(ui.defaultPrompt) ? ui.defaultPrompt : [ui.defaultPrompt];
      if (prompts.length > 3) fail("interface.defaultPrompt: at most 3 prompts");
      prompts.forEach((p, i) => {
        text(`interface.defaultPrompt[${i}]`, p, { max: 128, oneLine: true });
        if (/(^|\s)@\w/.test(p)) fail(`interface.defaultPrompt[${i}] must not contain an @mention`);
      });
      const normalized = prompts.map((p) => p.normalize("NFKC").replace(/\s+/g, " ").trim());
      if (new Set(normalized).size !== normalized.length) fail("interface.defaultPrompt: prompts must be unique");
    }
    image("interface.logo", ui.logo);
    image("interface.composerIcon", ui.composerIcon);
    if (ui.screenshots?.length) fail("interface.screenshots: only allowed when the MCP server returns a UI template");

    if (openai.onboardingSkill !== undefined && !existsSync(join(root, openai.onboardingSkill)))
      fail(`onboardingSkill: ${openai.onboardingSkill} does not exist`);

    const review = openai.review ?? {};
    const positive = review.test_cases?.positive ?? [];
    const negative = review.test_cases?.negative ?? [];
    if (positive.length !== 5) fail(`review.test_cases.positive has ${positive.length} cases; initial MCP review needs exactly 5`);
    if (negative.length !== 3) fail(`review.test_cases.negative has ${negative.length} cases; initial MCP review needs exactly 3`);
    positive.forEach((c, i) => {
      for (const key of ["description", "prompt", "tools_triggered", "expected_behavior"]) text(`positive[${i}].${key}`, c[key], { max: 4000 });
    });
    negative.forEach((c, i) => {
      for (const key of ["description", "prompt"]) text(`negative[${i}].${key}`, c[key], { max: 4000 });
    });
    if (review.commerce !== undefined && typeof review.commerce !== "boolean") fail("review.commerce must be a boolean");

    const countries = openai.publication?.countries;
    if (countries !== undefined && (!Array.isArray(countries) || countries.some((c) => !/^[A-Z]{2}$/.test(c))))
      fail("publication.countries must be uppercase two-letter country codes");
  }

  // The package must never carry reviewer access; it goes in the portal's Review details form.
  const raw = readFileSync(join(root, "plugin.json"), "utf8");
  for (const key of ["test_credentials", "reviewer_instructions", "clientSecret"]) if (raw.includes(`"${key}"`)) fail(`plugin.json must not contain ${key}`);
}

// --- mcp.json --------------------------------------------------------------------
const mcp = readJson("mcp.json");
if (mcp) {
  if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") fail("mcp.json: $schema must be the Agent Plugins 1.0.0 MCP schema");
  const servers = Object.entries(mcp.mcpServers ?? {});
  if (servers.length !== 1) fail(`mcp.json: plugin-level review cases need exactly one MCP server; found ${servers.length}`);
  for (const [name, server] of servers) {
    if (server.type !== "streamable-http") fail(`mcp.json ${name}: type must be streamable-http`);
    if (!isHttps(server.url)) fail(`mcp.json ${name}: url must be HTTPS`);
    if (server.headers && Object.keys(server.headers).length) fail(`mcp.json ${name}: public submission rejects non-empty headers`);
    const auth = server.extensions?.["com.openai"]?.auth;
    if (!auth || !["oauth", "mixed", "none"].includes(auth.type)) fail(`mcp.json ${name}: auth.type must be oauth, mixed or none for the submission portal`);
    if (auth?.client && ["dcr", "cimd"].includes(auth.client.mode) && ("clientId" in auth.client))
      fail(`mcp.json ${name}: a ${auth.client.mode} client must not declare clientId`);
  }
}

// --- skills ----------------------------------------------------------------------
const skillsDir = join(root, "skills");
const names = new Set();
for (const dir of readdirSync(skillsDir)) {
  const path = join(skillsDir, dir);
  if (!statSync(path).isDirectory()) continue;
  if (dir.startsWith(".")) fail(`skills/${dir}: skill directories must not start with a dot`);
  const file = join(path, "SKILL.md");
  if (!existsSync(file)) {
    fail(`skills/${dir}: missing SKILL.md`);
    continue;
  }
  const content = readFileSync(file, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    fail(`skills/${dir}/SKILL.md: must start with YAML front matter between --- lines`);
    continue;
  }
  const field = (key) => {
    const line = match[1].match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    if (!line) return undefined;
    let value = line[1].trim();
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    else if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    return value;
  };
  const name = field("name");
  const description = field("description");
  text(`skills/${dir} name`, name, { oneLine: true });
  text(`skills/${dir} description`, description, { max: 1024 });
  if (!match[2].trim()) fail(`skills/${dir}/SKILL.md: instructions must not be empty`);
  if (name) {
    if (names.has(name)) fail(`skills/${dir}: duplicate skill name ${name}`);
    names.add(name);
    if (`${plugin?.name}:${name}`.length > 64) fail(`skills/${dir}: ${plugin?.name}:${name} is longer than 64 characters`);
  }
  // OpenAI asks for provider-neutral instructions in skills imported from Claude plugins.
  if (/\bClaude\b/.test(content)) fail(`skills/${dir}/SKILL.md mentions Claude; use provider-neutral wording such as "the model"`);
}
if (names.size === 0) fail("skills/: no skills found");

if (errors.length) {
  console.error(`${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK: plugin.json, mcp.json and ${names.size} skills pass the documented submission limits.`);
