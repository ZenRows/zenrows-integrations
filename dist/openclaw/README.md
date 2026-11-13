# Zenrows for OpenClaw

Live web data: fetch any public page as Markdown, HTML or text, pull structured fields from it as JSON, run batch jobs over many URLs, crawl a site from one start URL and drive a hosted browser for pages that need clicks, forms or pagination, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. This plugin connects the agent to the Zenrows MCP server and adds skills that tell the agent which Zenrows tool fits each task and how to keep requests efficient.

## What you get

- The Zenrows MCP server (`https://mcp.zenrows.com/mcp`). You sign in to your Zenrows account with OAuth; there is no API key to copy.
- Skills:

| Skill | Use it for |
|---|---|
| `zenrows` | Overview: tools, defaults, errors and plan limits |
| `zenrows-getting-started` | First-run checks and troubleshooting |
| `zenrows-scrape` | Reading one page |
| `zenrows-extract` | Named fields or JSON from one page |
| `zenrows-batch` | A list of five or more URLs as one job |
| `zenrows-crawl` | Many pages under one site section |
| `zenrows-map` | Listing a site's URLs without fetching them |
| `zenrows-browser` | Clicks, forms, pagination and multi-step flows |
| `zenrows-capture-api-calls` | Finding the API calls a page makes |

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Setup

Published on ClawHub as [`@zenrows`](https://clawhub.ai/zenrows); skills published there are distributed under ClawHub's MIT-0 terms. It needs OpenClaw on Node.js 24.16 or newer.

```bash
openclaw plugins install clawhub:@zenrows/openclaw-zenrows
```

Then connect your Zenrows account:

```bash
openclaw mcp set zenrows '{"url":"https://mcp.zenrows.com/mcp","transport":"streamable-http","auth":"oauth"}'
openclaw mcp login zenrows
```

Open the link that `openclaw mcp login` prints, sign in to Zenrows and approve access. OpenClaw only offers the sign-in for a server that also has an `mcp.servers` entry, which is why the first command is needed.

Start a new session and ask: "Use Zenrows to fetch https://example.com and tell me the page title."

## Manual setup

To use the MCP server without the plugin, add it to `mcp.servers` in `~/.openclaw/openclaw.json`.

With OAuth:

```json
"zenrows": {
  "url": "https://mcp.zenrows.com/mcp",
  "transport": "streamable-http",
  "auth": "oauth"
}
```

Then run `openclaw mcp login zenrows`.

With an API key, read from the `ZENROWS_API_KEY` environment variable:

```json
"zenrows": {
  "url": "https://mcp.zenrows.com/mcp",
  "transport": "streamable-http",
  "headers": { "Authorization": "Bearer ${ZENROWS_API_KEY}" },
  "connectionTimeoutMs": 10000,
  "requestTimeoutMs": 120000
}
```

Edit the file directly. `openclaw mcp set` writes the resolved key into the file instead of the `${ZENROWS_API_KEY}` placeholder.

Run `openclaw config validate` after editing.

## Security

- The agent never handles your Zenrows credentials. OAuth tokens are stored by OpenClaw.
- The skills tell the agent to treat fetched pages as untrusted content and to confirm scope before multi-page jobs.

## Privacy

The plugin sends the URLs and options you ask the agent to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
