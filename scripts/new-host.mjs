// npm run new-host: asks a few questions and creates platforms/<host>/ with a
// manifest, MCP config, README, getting-started slot and vars, plus the host's
// release-please package. Text the host still needs is marked TODO(new-host),
// and npm run validate fails until it's filled in.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { catalogs, platformsDir, root } from "./lib.mjs";

// Where each kind of host expects its files. "marketplace" is the catalog a host
// reads at the top of the repo to install from ./dist/<id>; empty means the host
// installs some other way (a mirror repo, a ZIP upload, a registry).
const layouts = {
  claude: {
    label: "Claude-style (.claude-plugin/plugin.json + .mcp.json)",
    manifest: ".claude-plugin/plugin.json",
    mcp: ".mcp.json",
    mcpType: "http",
    marketplace: ".claude-plugin/marketplace.json",
    extra: { icon: "./assets/logo.png", mcpServers: "./.mcp.json" },
  },
  cursor: {
    label: "Cursor-style (.cursor-plugin/plugin.json + mcp.json)",
    manifest: ".cursor-plugin/plugin.json",
    mcp: "mcp.json",
    mcpType: "",
    marketplace: "",
    extra: { logo: "assets/logo.png", skills: "skills", mcpServers: "mcp.json" },
  },
  agent: {
    label: "Agent Plugins standard (plugin.json + mcp.json at the plugin root; Copilot, OpenAI)",
    manifest: "plugin.json",
    mcp: "mcp.json",
    mcpType: "streamable-http",
    marketplace: "",
    extra: {},
  },
  custom: { label: "Something else (I'll give the paths)", manifest: "", mcp: "", mcpType: "", marketplace: "", extra: {} },
};

// Read answers as a stream of lines, so piped input (tests, scripts) works as
// well as typing at the prompt.
const rl = createInterface({ input: stdin, terminal: stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { fallback = "", check } = {}) {
  for (;;) {
    const hint = fallback ? ` [${fallback}]` : "";
    stdout.write(`${question}${hint}: `);
    const { value, done } = await lines.next();
    if (done) throw new Error("input ended before every question was answered; nothing was created");
    if (!stdin.isTTY) stdout.write(`${value}\n`);
    const answer = value.trim() || fallback;
    const problem = check?.(answer);
    if (!problem) return answer;
    console.log(`  ${problem}`);
  }
}

async function choose(question, options) {
  console.log(question);
  const keys = Object.keys(options);
  keys.forEach((k, i) => console.log(`  ${i + 1}. ${options[k].label}`));
  const n = await ask("Choose a number", {
    fallback: "1",
    check: (a) => (/^\d+$/.test(a) && a >= 1 && a <= keys.length ? "" : `Enter 1 to ${keys.length}.`),
  });
  return keys[Number(n) - 1];
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const capitalize = (s) => s.replace(/(^|-)([a-z])/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());
const relativePath = (p) => (/^[^/][\w./-]*$/.test(p) && !p.includes("..") ? "" : "Enter a relative path, for example .claude-plugin/plugin.json.");

// Catalogs other hosts already have, so two hosts never claim the same one.
const takenCatalogs = new Map(catalogs().map(({ host, file }) => [file, host]));

console.log("New host for zenrows-integrations. Press Enter to accept the value in [brackets].\n");

const id = await ask("Host id, used for platforms/<id>/, dist/<id>/ and the <id>-v1.2.3 tag (for example cursor)", {
  check: (a) =>
    !/^[a-z][a-z0-9-]*$/.test(a) ? "Use lowercase letters, digits and dashes, starting with a letter."
    : existsSync(join(platformsDir, a)) ? `platforms/${a} already exists.`
    : "",
});
const host = await ask("Short name the skills use, as in \"Zenrows gives <name> live web data\"", { fallback: capitalize(id) });
const hostFull = await ask("Full product name, as in \"the Zenrows plugin in <name>\"", { fallback: host });
const connection = await ask(
  'What the host calls Zenrows once connected, as in "The <this> signs in with OAuth" (Claude: Zenrows connector)',
  { fallback: "Zenrows MCP server" },
);
const writeFiles = await ask(
  "Where the agent can write files, as in \"if you can write files (for example in <this>)\"",
  { fallback: `${host}'s agent mode` },
);
const skillPrefix = await ask("Prefix for skill folder names (empty for none; OpenClaw uses zenrows-)", {
  check: (a) => (/^[a-z0-9-]*$/.test(a) ? "" : "Use lowercase letters, digits and dashes."),
});

console.log("");
const layoutKey = await choose("Which plugin layout does the host read?", layouts);
const layout = { ...layouts[layoutKey] };
if (layoutKey === "custom") {
  layout.manifest = await ask("Path of the plugin manifest inside the plugin", { fallback: "plugin.json", check: relativePath });
  layout.mcp = await ask("Path of the MCP config inside the plugin", { fallback: "mcp.json", check: relativePath });
  layout.mcpType = await ask('MCP server "type" the host expects (empty to leave it out)', { fallback: "http" });
}
const marketplace = await ask(
  "Marketplace catalog at the top of the repo that the host installs from, pointing at ./dist/<id> (empty if it installs from a mirror, ZIP or registry)",
  {
    fallback: layout.marketplace,
    check: (a) =>
      !a ? ""
      : relativePath(a) ||
        (takenCatalogs.has(a) ? `${a} already belongs to ${takenCatalogs.get(a)}.`
        : existsSync(join(root, a)) ? `${a} already exists.`
        : ""),
  },
);
const description = await ask("One-line plugin description", {
  fallback: `Live web data for ${hostFull}: fetch pages, extract structured data, run batch jobs and drive hosted browser sessions through the Zenrows MCP server.`,
});

const platform = join(platformsDir, id);
const files = new Map();

files.set(
  "vars.yaml",
  [
    "# Text that differs per host. Shared skills use these as {{name}}; {{version}}",
    "# comes from .release-please-manifest.json.",
    `host: ${JSON.stringify(host)}`,
    `host_full: ${JSON.stringify(hostFull)}`,
    `connection: ${JSON.stringify(connection)}`,
    `write_files_example: ${JSON.stringify(writeFiles)}`,
    `skill_prefix: ${JSON.stringify(skillPrefix)}`,
    "# To give a skill a different name on this host than skill_prefix + its",
    "# shared name, list it here, for example:",
    "# skill_names:",
    "#   scrape-webpage: zenrows-scrape",
    "",
  ].join("\n"),
);

files.set(
  layout.manifest,
  json({
    name: "zenrows",
    version: "{{version}}",
    description,
    author: { name: "Zenrows", email: "integrations@zenrows.com", url: "https://www.zenrows.com" },
    homepage: "https://docs.zenrows.com",
    repository: "https://github.com/ZenRows/zenrows-integrations",
    license: "MIT",
    keywords: ["web-scraping", "data-extraction", "browser-automation", "mcp", "zenrows"],
    ...layout.extra,
  }),
);

files.set(
  layout.mcp,
  json({ mcpServers: { zenrows: { ...(layout.mcpType ? { type: layout.mcpType } : {}), url: "https://mcp.zenrows.com/mcp" } } }),
);

// The getting-started skill's {{> connect}} slot: what to do when the Zenrows
// tools are missing, for example how to connect and sign in on each app.
files.set(
  "skills/getting-started/connect.md",
  `- Tools missing entirely: Zenrows is not connected yet. Tell the user how to connect it:\n` +
    `  - TODO(new-host): how to connect and sign in to the \`zenrows\` server in ${hostFull}, one bullet per app (CLI, IDE, …).\n`,
);

files.set(
  "README.md",
  `# Zenrows for ${hostFull}

Live web data for ${hostFull}. This plugin connects ${host} to the Zenrows MCP server, so ${host} can fetch the current content of any public page, pull structured fields from it, run batch jobs over many URLs, and drive a hosted browser for pages that need clicks, forms or pagination. It also adds skills that tell ${host} which Zenrows tool fits each task and how to keep requests efficient.

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Setup

TODO(new-host): how to install the plugin in ${hostFull}, and how to sign in to Zenrows.

Then ask ${host} something like: "Use Zenrows to get the product names and prices from https://www.scrapingcourse.com/ecommerce/".

## Privacy

The plugin sends the URLs and options you ask ${host} to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
`,
);

// The catalog lives at the top of the repo, not in platforms/<id>/. It isn't
// rendered: release-please bumps its version along with the host's.
const catalog = marketplace
  ? json({
      name: "zenrows",
      owner: { name: "Zenrows", email: "integrations@zenrows.com" },
      metadata: { description: `Zenrows for ${hostFull}: live web data through the Zenrows MCP server.`, version: "0.1.0" },
      plugins: [{ name: "zenrows", description, version: "0.1.0", source: `./dist/${id}` }],
    })
  : null;

// release-please: one package per host, with the files that carry its version.
const configPath = join(root, "release-please-config.json");
const manifestPath = join(root, ".release-please-manifest.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const versions = JSON.parse(readFileSync(manifestPath, "utf8"));
const extraFiles = [{ type: "json", path: layout.manifest, jsonpath: "$.version" }];
if (marketplace) {
  extraFiles.push(
    { type: "json", path: `/${marketplace}`, jsonpath: "$.metadata.version" },
    { type: "json", path: `/${marketplace}`, jsonpath: "$.plugins[0].version" },
  );
}
config.packages[`dist/${id}`] = { component: id, "package-name": id, "extra-files": extraFiles };
versions[`dist/${id}`] = "0.1.0";

console.log(`\nThis creates platforms/${id}/:`);
for (const file of files.keys()) console.log(`  ${file}`);
if (catalog) console.log(`the catalog ${marketplace} at the top of the repo,`);
console.log(`and adds dist/${id} at 0.1.0 to release-please-config.json and .release-please-manifest.json.`);
const go = await ask("Create it? (y/n)", { fallback: "y" });
rl.close();
if (!/^y/i.test(go)) {
  console.log("Nothing was created.");
  process.exit(0);
}

for (const [file, content] of files) {
  mkdirSync(dirname(join(platform, file)), { recursive: true });
  writeFileSync(join(platform, file), content);
}
if (catalog) {
  mkdirSync(dirname(join(root, marketplace)), { recursive: true });
  writeFileSync(join(root, marketplace), catalog);
}
writeFileSync(configPath, json(config));
writeFileSync(manifestPath, json(versions));

console.log(`
Created platforms/${id}/. Next:
  1. Fill in every TODO(new-host): grep -rn "TODO(new-host)" platforms/${id}
     (npm run validate fails until they're gone).
  2. Add anything else ${hostFull} needs to platforms/${id}/ (more manifest fields, rules, commands).
  3. npm run render, then npm run validate, and commit platforms/${id}, dist/${id}${marketplace ? ` and ${marketplace}` : ""} together.`);
