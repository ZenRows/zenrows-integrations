### 1. Install the plugin

Install Zenrows from the Cursor Marketplace.

### 2. Authorize

The plugin adds the hosted Zenrows MCP server. After installing, open Settings, Tools and MCP, find the `zenrows` server, click “Connect”, and complete the Zenrows authorization in your browser. Cursor stores and refreshes the token for you.

### 3. Verify

Run `/zenrows-doctor` in a chat to confirm the connection is live and authorized, or just ask the agent “fetch https://httpbin.io/get” and watch it scrape. If the connection looks stuck, open the command palette (Cmd+Shift+P), run “Cursor: Clear All MCP Tokens”, restart Cursor, and re-authorize.
