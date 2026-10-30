// npm run new-host: asks for the host's id and full name, and creates
// platforms/<id>/ from templates (vars, a generic manifest and MCP config, the
// README and the getting-started sign-in slot) plus the host's release-please
// package. What only a person can decide is marked TODO(new-host), and
// npm run validate fails until it's done.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { platformsDir, root } from "./lib.mjs";

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

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const capitalize = (s) => s.replace(/(^|-)([a-z])/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());

console.log("New host for zenrows-integrations. Press Enter to accept the value in [brackets].\n");

const id = await ask("Host id, used for platforms/<id>/, dist/<id>/ and the <id>-v1.2.3 tag (for example cursor)", {
  check: (a) =>
    !/^[a-z][a-z0-9-]*$/.test(a) ? "Use lowercase letters, digits and dashes, starting with a letter."
    : existsSync(join(platformsDir, a)) ? `platforms/${a} already exists.`
    : "",
});
const name = await ask("Full product name (for example Claude Code)", { fallback: capitalize(id) });

const platform = join(platformsDir, id);
const files = new Map();

files.set(
  "vars.yaml",
  [
    "# Text that differs per host. Shared skills use these as {{name}}; {{version}}",
    "# comes from .release-please-manifest.json.",
    "# The name the skills use for the host, as in \"Zenrows gives <host> live web data\".",
    `host: ${JSON.stringify(name)}`,
    "# The full product name, as in \"the Zenrows plugin in <host_full>\".",
    `host_full: ${JSON.stringify(name)}`,
    "# What the host calls Zenrows once connected, as in \"The <connection> signs in with OAuth\"",
    "# (Claude: Zenrows connector).",
    'connection: "Zenrows MCP server"',
    "# Where the agent can write files, as in \"if you can write files (for example in <this>)\".",
    `write_files_example: "TODO(new-host): for example ${name}'s agent mode"`,
    "# Prefix for skill folder names (OpenClaw uses zenrows-).",
    'skill_prefix: ""',
    "# To give a skill a different name on this host, list it here, for example:",
    "# skill_names:",
    "#   scrape-webpage: zenrows-scrape",
    "# To leave a shared skill out on this host, list it here, for example:",
    "# skip_skills: [using-zenrows]",
    "",
  ].join("\n"),
);

// A generic manifest and MCP config. Each host reads its own layout, so the
// README's TODO asks for them to be moved and completed.
files.set(
  "plugin.json",
  json({
    name: "zenrows",
    version: "{{version}}",
    description: `Live web data for ${name}: fetch pages, extract structured data, run batch jobs and drive hosted browser sessions through the Zenrows MCP server.`,
    author: { name: "Zenrows", email: "integrations@zenrows.com", url: "https://www.zenrows.com" },
    homepage: "https://docs.zenrows.com",
    repository: "https://github.com/ZenRows/zenrows-integrations",
    license: "MIT",
    keywords: ["web-scraping", "data-extraction", "browser-automation", "mcp", "zenrows"],
  }),
);
files.set("mcp.json", json({ mcpServers: { zenrows: { url: "https://mcp.zenrows.com/mcp" } } }));

// The getting-started skill's {{> connect}} slot: what to do when the Zenrows
// tools are missing, for example how to connect and sign in on each app.
files.set(
  "skills/getting-started/connect.md",
  `- Tools missing entirely: Zenrows is not connected yet. Tell the user how to connect it:\n` +
    `  - TODO(new-host): how to connect and sign in to the \`zenrows\` server in ${name}, one bullet per app (CLI, IDE, …).\n`,
);

files.set(
  "README.md",
  `# Zenrows for ${name}

TODO(new-host): before this host ships, check its plugin files. platforms/${id}/plugin.json and mcp.json are generic templates: move them to the paths ${name} reads (for example .claude-plugin/plugin.json), add the fields it needs, update the manifest path in release-please-config.json, and add a marketplace catalog at the top of the repo if ${name} installs from a subfolder. Then delete this paragraph.

Live web data for ${name}. This plugin connects ${name} to the Zenrows MCP server, so it can fetch the current content of any public page, pull structured fields from it, run batch jobs over many URLs, and drive a hosted browser for pages that need clicks, forms or pagination. It also adds skills that tell ${name} which Zenrows tool fits each task and how to keep requests efficient.

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Setup

TODO(new-host): how to install the plugin in ${name}, and how to sign in to Zenrows.

Then ask ${name} something like: "Use Zenrows to get the product names and prices from https://www.scrapingcourse.com/ecommerce/".

## Privacy

The plugin sends the URLs and options you ask ${name} to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
`,
);

// release-please: one package per host; its manifest's version is bumped on release.
const configPath = join(root, "release-please-config.json");
const manifestPath = join(root, ".release-please-manifest.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const versions = JSON.parse(readFileSync(manifestPath, "utf8"));
config.packages[`dist/${id}`] = {
  component: id,
  "package-name": id,
  "extra-files": [{ type: "json", path: "plugin.json", jsonpath: "$.version" }],
};
versions[`dist/${id}`] = "0.1.0";

console.log(`\nThis creates platforms/${id}/:`);
for (const file of files.keys()) console.log(`  ${file}`);
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
writeFileSync(configPath, json(config));
writeFileSync(manifestPath, json(versions));

console.log(`
Created platforms/${id}/ from templates. Next:
  1. Fill in every TODO(new-host): grep -rn "TODO(new-host)" platforms/${id}
     (npm run validate fails until they're gone). The README's first TODO covers
     moving plugin.json and mcp.json to the layout ${name} reads.
  2. npm run render, then npm run validate, and commit platforms/${id}, dist/${id}
     and the release-please files together.`);
