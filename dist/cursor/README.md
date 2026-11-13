# Zenrows for Cursor

Live web data: fetch any public page as Markdown, HTML or text, pull structured fields from it as JSON, run batch jobs over many URLs, crawl a site from one start URL and drive a hosted browser for pages that need clicks, forms or pagination, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. This plugin connects Cursor to the Zenrows MCP server and adds skills that tell Cursor which Zenrows tool fits each task and how to keep requests efficient.

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

The plugin also adds `/zenrows-doctor`, which checks that the Zenrows connection is live and authorized.

## Privacy

The plugin sends the URLs and options you ask Cursor to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- MCP server documentation: [docs.zenrows.com/mcp/overview](https://docs.zenrows.com/mcp/overview)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
