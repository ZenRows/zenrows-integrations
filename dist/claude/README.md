# Zenrows for Claude

Live web data: fetch any public page as Markdown, HTML or text, pull structured fields from it as JSON, run batch jobs over many URLs, crawl a site from one start URL and drive a hosted browser for pages that need clicks, forms or pagination, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. This plugin connects Claude to the Zenrows MCP server and adds skills that tell Claude which Zenrows tool fits each task and how to keep requests efficient.

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

Install the plugin. In Claude Code:

```
/plugin install zenrows --marketplace ZenRows/zenrows-integrations
```

Then sign in to Zenrows when Claude asks you to connect:

- **Claude (web or desktop):** Customize → Connectors → Zenrows → Connect.
- **Claude Code:** run `/mcp`, select `zenrows` and authenticate.

Then ask Claude something like: "Use Zenrows to get the product names and prices from https://www.scrapingcourse.com/ecommerce/".

## Privacy

The plugin sends the URLs and options you ask Claude to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
