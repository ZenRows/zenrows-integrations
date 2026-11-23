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
