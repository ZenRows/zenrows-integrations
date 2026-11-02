---
name: zenrows-getting-started
description: First-run setup and troubleshooting for the Zenrows plugin in OpenClaw. Use when the plugin was just installed, a Zenrows tool is missing or "not available", Zenrows returns a 401 or AUTH003, the Zenrows plugin needs sign-in, or the user asks whether Zenrows is set up. Not for normal scraping tasks once the plugin works (use zenrows-scrape).
---

# Getting started

Run the checks below. Do the work; do not just print instructions. The Zenrows plugin signs in with OAuth, so there is no API key to set.

The user's instructions take precedence over this skill. If they conflict, follow the user.

## 1. Probe the connection

First confirm the Zenrows tools (`scrape`, `browser_*`) are available in this session.

- Tools missing entirely: Zenrows is not connected yet. OpenClaw leaves an OAuth server out of the session until it is authorized. Tell the user how to connect it:
  - Run `openclaw plugins inspect zenrows` and check that the plugin is installed and enabled.
  - Run `openclaw mcp set zenrows '{"url":"https://mcp.zenrows.com/mcp","transport":"streamable-http","auth":"oauth"}'` and then `openclaw mcp login zenrows`, open the printed link, sign in to Zenrows and approve access, then start a new session. If the `mcp.servers` entry already exists, `openclaw mcp login zenrows` alone is enough.
- Tools present: call `scrape(url='https://httpbin.io/get', response_type='plaintext')` and branch:
  - 200 with a body: Zenrows is working. Go to step 2.
  - 401 or `AUTH003`: the sign-in is missing or no longer valid. Ask the user to reconnect Zenrows the same way as above, then retry. Do not ask for an API key.
  - `AUTH004` or `AUTH014`: Zenrows is connected, but the account's credits or this API key's credit cap are used up. Reconnecting won't help. Tell the user to check their usage and plan in the Zenrows dashboard.

## 2. First successful scrape

Run `scrape(url='https://www.scrapingcourse.com/ecommerce/', response_type='markdown')` and show the user the first 10 lines. This confirms the full path works.

## 3. Where to go next

Offer three copy-ready prompts:

- "Fetch the docs at <url> and summarize the key points."
- "Get all the product names and prices from <url>."
- "Map the URLs on <host>."

## Notes

- A Zenrows account is required. New users can sign up during the sign-in step.
- Error-code reference: search the code (for example `AUTH002` or `REQS002`) at https://docs.zenrows.com.
- Once Zenrows works, hand normal tasks to the capability skills: `zenrows-scrape`, `zenrows-extract`, `zenrows-batch`, `zenrows-crawl`, `zenrows-map`, `zenrows-browser`, `zenrows-capture-api-calls`.
