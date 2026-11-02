---
name: scrape-webpage
description: Retrieve the content of one specific web page. Use when the user wants to read, fetch, summarize, or get what a single URL says, including JavaScript-heavy pages. Not for discovering the URLs on a site (use map or crawl), not for five or more URLs the user already has (use batch), not for pulling specific fields like prices or emails (use extract-structured-data), and not for pages that require clicks, logins, or form input (use browser-automation).
---

# Scrape webpage

The user's instructions take precedence over this skill. If they conflict, follow the user.

## Instructions

1. Identify the target URL from the user's message.
2. Call `scrape(url, response_type='markdown')`. Do not read local plugin or MCP config files first.
3. By default Zenrows adds JavaScript rendering or premium proxies only when the page needs them, so the same call works for static pages and single-page apps. Do not set `js_render` or `premium_proxy` yourself.
4. Summarize or extract the requested information from the returned markdown.
5. If the content is larger than needed, re-scrape with `css_extractor` targeting only the relevant section. Drop `response_type='markdown'` when you do, since the two are alternatives, not additive.
6. For geo-restricted pages, add `proxy_country` with the target country's ISO 3166 code.
