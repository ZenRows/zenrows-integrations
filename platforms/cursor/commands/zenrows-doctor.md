---
name: zenrows-doctor
description: Check that the Zenrows MCP connection is live and authorized, and confirm scraping works.
---

# /zenrows-doctor

Report whether Zenrows is connected, authorized, and able to scrape. Steps:

1. Check which Zenrows MCP tools are available and report them by primitive: Fetch (`scrape`), Extract (`extract`), Batch (`batch_*`), Crawl (`crawl_*`) and Browser Sessions (`browser_*`). Name any that are missing. If no Zenrows tools are present at all, the plugin is not connected: confirm it is installed and enabled, fully restart Cursor, and check Settings, MCPs for a `zenrows` entry.
2. Run a probe: `scrape(url='https://httpbin.io/get', response_type='plaintext')`.
   - Returns content: Zenrows is connected, authorized, and scraping works. Report success.
   - Returns a 401 or `AUTH003`: the OAuth login is missing or expired. Tell the user to complete the Zenrows authorization when Cursor shows "Needs login", or, if it is stuck, run "Cursor: Clear All MCP Tokens" from the command palette (Cmd+Shift+P) and re-authorize.
   - Returns `AUTH004` or `AUTH014`: Zenrows is connected, but the account's credits or this API key's credit cap are used up. Reconnecting won't help. Tell the user to check their usage and plan in the Zenrows dashboard.
3. Call `account_usage` (it is free and changes nothing) to report the plan's usage.
4. Keep the output to a few lines: connection status, the tools found by primitive, auth status and usage.
