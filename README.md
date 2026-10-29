# Zenrows for AI agents

Live web data for AI coding agents. The Zenrows plugins connect your agent to the Zenrows MCP server, so it can fetch the current content of any public page, pull structured fields from it, run batch jobs over many URLs, crawl a site section, and drive a hosted browser for pages that need clicks, forms or pagination. Each plugin also adds skills that tell the agent which Zenrows tool fits each task and how to keep requests efficient.

## Install

You sign in to your Zenrows account with OAuth; there is no API key to copy.

### GitHub Copilot

In Copilot CLI:

```
copilot plugin marketplace add ZenRows/zenrows-integrations
copilot plugin install zenrows@zenrows
```

Then run `/mcp auth zenrows` and sign in in the browser.

In VS Code, run **Chat: Plugins** from the Command Palette and install from `ZenRows/zenrows-integrations`, then run **MCP: List Servers**, select `zenrows` and start it. For Copilot cloud agent, add the plugin to `enabledPlugins` in the repository's `.github/copilot/settings.json`.

Full setup: [dist/copilot/README.md](dist/copilot/README.md).

## Skills

| Skill | Use it for |
|---|---|
| `using-zenrows` | Overview: tools, defaults, errors and plan limits |
| `getting-started` | First-run checks and troubleshooting |
| `scrape-webpage` | Reading one page |
| `extract-structured-data` | Named fields or JSON from one page |
| `batch` | A list of five or more URLs as one job |
| `crawl` | Many pages under one site section |
| `map` | Listing a site's URLs without fetching them |
| `browser-automation` | Clicks, forms, pagination and multi-step flows |
| `capture-api-calls` | Finding the API calls a page makes |

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Privacy

The plugins send the URLs and options you ask your agent to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## Repository structure

Every host's plugin is generated from one set of shared skills, so a fix is made once and reaches every host.

```
skills/            shared skills, written once
platforms/<host>/  what differs per host: manifests, README, variables and text slots
shared/            files every host ships as they are (logo)
dist/<host>/       GENERATED: the plugin each host installs
schemas/           JSON Schemas the manifests are checked against
scripts/           render, validate, override, new-host
```

To change a skill or add a host, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
