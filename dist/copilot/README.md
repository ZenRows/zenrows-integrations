# Zenrows for GitHub Copilot

Live web data: fetch any public page as Markdown, HTML or text, pull structured fields from it as JSON, run batch jobs over many URLs, crawl a site from one start URL and drive a hosted browser for pages that need clicks, forms or pagination, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. This plugin connects Copilot to the Zenrows MCP server and adds skills that tell Copilot which Zenrows tool fits each task and how to keep requests efficient.

## What you get

- The Zenrows MCP server (`https://mcp.zenrows.com/mcp`). You sign in to your Zenrows account with OAuth; there is no API key to copy.
- Skills:

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

## Setup

Install the plugin. In Copilot CLI, add this repository as a marketplace and install from it:

```
copilot plugin marketplace add ZenRows/zenrows-integrations
copilot plugin install zenrows@zenrows
```

In VS Code, run **Chat: Plugins** from the Command Palette and install from `ZenRows/zenrows-integrations`. For Copilot cloud agent, add the plugin to `enabledPlugins` in the repository's `.github/copilot/settings.json`.

Then sign in to Zenrows:

- **Copilot CLI:** run `/mcp auth zenrows` and sign in in the browser.
- **VS Code:** run **MCP: List Servers**, select `zenrows`, start it and allow it to authenticate.

Then ask Copilot something like: "Use Zenrows to get the product names and prices from https://www.scrapingcourse.com/ecommerce/".

## Privacy

The plugin sends the URLs and options you ask Copilot to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- MCP server documentation: [docs.zenrows.com/mcp/overview](https://docs.zenrows.com/mcp/overview)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
