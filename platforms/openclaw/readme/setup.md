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
