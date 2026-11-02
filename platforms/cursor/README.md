# Zenrows Cursor Plugin

Web data for Cursor. Scrape, crawl, and map any site, run browser automation, and pull structured data, straight from your AI agent in plain English. Powered by [Zenrows Fetch](https://docs.zenrows.com/fetch/api-reference) and [Browser Sessions](https://docs.zenrows.com/browser-sessions/introduction).

## Prerequisites

- [Cursor](https://cursor.com)
- A [Zenrows account](https://app.zenrows.com/register) to authorize with

## Installation

### 1. Install the plugin

Install Zenrows from the Cursor Marketplace.

### 2. Authorize

The plugin adds the hosted Zenrows MCP server. After installing, open Settings, Tools and MCP, find the `zenrows` server, click “Connect”, and complete the Zenrows authorization in your browser. Cursor stores and refreshes the token for you.

### 3. Verify

Run `/zenrows-doctor` in a chat to confirm the connection is live and authorized, or just ask the agent “fetch https://httpbin.io/get” and watch it scrape. If the connection looks stuck, open the command palette (Cmd+Shift+P), run “Cursor: Clear All MCP Tokens”, restart Cursor, and re-authorize.

## Usage examples

| Prompt | What the agent does |
|--------|---------------------|
| Fetch the OpenAI streaming docs and tell me how to stream responses. | Scrapes the page and summarizes the streaming section. |
| Scrape competitor.com/pricing and compare it to ours. | Scrapes and parses the pricing into a comparison. |
| Get all the product links from shop.example.com/phones. | Extracts links from the page. |
| Map the URLs on docs.example.com. | Lists the site's URLs from its sitemap. |
| Crawl all the pages under example.com/guide. | Follows internal links and collects each page. |
| Extract every email address from dir.example.com. | Returns a deduplicated email list. |
| Log into this site, open the first result, and give me its content. | Runs a browser session through the steps. |
| What internal API does this page use to load its data? | Inspects the page's network calls and surfaces the endpoint. |

## What's included

| Component | Purpose |
|-----------|---------|
| `skills/` | An overview of the Zenrows tools (`using-zenrows`), and task workflows: scrape, extract, batch, crawl, map, browser automation, API discovery, getting started |
| `commands/zenrows-doctor.md` | `/zenrows-doctor` connection and auth check |
| `mcp.json` | Connects to the hosted Zenrows MCP server over OAuth |

## Links

- [Zenrows MCP documentation](https://docs.zenrows.com/mcp/overview)
- [Create a Zenrows account](https://app.zenrows.com/register)

## Contributing

The plugin is built from [ZenRows/zenrows-integrations](https://github.com/ZenRows/zenrows-integrations). See its [CONTRIBUTING.md](https://github.com/ZenRows/zenrows-integrations/blob/main/CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
