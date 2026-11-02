---
name: capture-api-calls
description: Discover the background API or XHR endpoints a page calls, or reverse-engineer how it loads its data. Use when the user wants the underlying request a site makes, not the rendered page. Not for interacting with the page UI (use browser-automation), and not for reading rendered content (use scrape-webpage).
---

# Capture API calls

The user's instructions take precedence over this skill. If they conflict, follow the user.

## Instructions

1. Open a session with `browser_navigate(url)` and save the `session_id`.
2. Let the page finish loading: `browser_wait(session_id, ms=3000)`. Do not use `browser_wait_for_navigation` here; that must run before a navigation-triggering action, not after `browser_navigate`.
3. Collect network resource URLs with `browser_evaluate`:

   ```javascript
   JSON.stringify(
     performance.getEntriesByType('resource')
       .filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest' || r.name.includes('/api/'))
       .map(r => ({ url: r.name, type: r.initiatorType }))
   )
   ```

4. Identify the endpoint(s) most likely returning the target data (JSON paths, `/api/` URLs, GraphQL endpoints).
5. Present the endpoint URL, the method if inferable, and a sample response shape.
6. Optionally call the endpoint directly with `scrape(url=<api_endpoint>, response_type='html')` to get the raw response body.
7. Always call `browser_close(session_id)` when done.

## Fallback

If `performance.getEntriesByType` returns nothing (a single-page app with deferred loads), interact with the page (scroll, click load triggers) and re-run the evaluate script, or inspect inline `<script>` tags via `browser_get_html`.

## Note

The Zenrows `scrape` tool does not expose a network-capture parameter, so use the browser-plus-evaluate workflow above. If one is added, this skill collapses to a single `scrape` call.
