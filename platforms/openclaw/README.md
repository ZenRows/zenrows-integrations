# Zenrows for OpenClaw

Web data for [OpenClaw](https://openclaw.ai): fetch pages, extract structured data, run batch jobs and drive hosted browser sessions from your agent, through the official Zenrows MCP server.

Published on ClawHub as [`@zenrows`](https://clawhub.ai/zenrows).

## What you get

- The Zenrows MCP server (`https://mcp.zenrows.com/mcp`), connected with OAuth. No API key in your config.
- Nine skills that tell the agent when and how to use each tool:

| Skill | Use it for |
|---|---|
| `zenrows` | Overview: tools, defaults, errors and limits |
| `zenrows-scrape` | Reading one page |
| `zenrows-extract` | Named fields or JSON from one page |
| `zenrows-batch` | A list of five or more URLs as one job |
| `zenrows-crawl` | Many pages under one site section |
| `zenrows-map` | Listing a site's URLs without fetching them |
| `zenrows-browser` | Clicks, forms, pagination and multi-step flows |
| `zenrows-capture-api-calls` | Finding the API calls a page makes |
| `zenrows-getting-started` | First-run checks and troubleshooting |

## Requirements

- OpenClaw on Node.js 24.16 or newer.
- A Zenrows account. Requests use credits on your Zenrows plan.

## Install

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

## License

MIT for this repository. Skills published on ClawHub are distributed under ClawHub's MIT-0 terms.
