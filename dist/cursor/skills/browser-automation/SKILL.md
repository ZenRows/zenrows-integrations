---
name: browser-automation
description: 'Drive a page through steps before its content is available: clicking, filling forms, logging in, paginating, or multi-step navigation that a single fetch cannot do. Use when interaction is required to reach the content. Not for static page reads (use scrape-webpage), and not for passively listing the network or API calls a page makes (use capture-api-calls).'
---

# Browser automation

The user's instructions take precedence over this skill. If they conflict, follow the user.

## Instructions

1. Open a session with `browser_navigate(url)`. Save the returned `session_id` and pass it to every later call.
2. Find the selectors you need with `browser_get_accessibility_tree` or `browser_query_selector_all`. Both are cheaper and more precise than a screenshot. Take `browser_screenshot` only when the page state is unclear or the user asked to see it.
3. Run the interaction as one `browser_batch` call whenever the steps are known in advance. Every round trip to the hosted browser costs seconds; a login sent as six separate calls is six times slower than it needs to be.
4. Fall back to individual `browser_*` calls only when a later step depends on reading an earlier result.
5. Always call `browser_close(session_id)` when done, to free a concurrency slot.

## browser_batch

`browser_batch(session_id, actions, stop_on_error)` runs 1 to 50 ordered actions in one call, reads included. A login and its result:

```json
{
  "session_id": "<id>",
  "actions": [
    { "type": "wait_for_selector", "selector": "#email" },
    { "type": "fill", "selector": "#email", "value": "user@example.com" },
    { "type": "fill", "selector": "#password", "value": "secret" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "wait_for_navigation" },
    { "type": "get_text" }
  ]
}
```

Action names inside `actions` drop the `browser_` prefix: `navigate`, `go_back`, `go_forward`, `reload`, `click`, `hover`, `type`, `fill`, `select`, `check`, `uncheck`, `focus`, `press_key`, `scroll`, `drag`, `wait`, `wait_for_selector`, `wait_for_navigation`, `evaluate`, `screenshot`, `get_text`, `get_html`, `get_url`, `get_title`, `get_attribute`, `get_accessibility_tree`, `query_selector_all`.

Three traps:

- The action is `select`, not `select_option`.
- `fill` takes `value`. `type` takes `text`.
- `stop_on_error` defaults to `true`, so one bad selector halts the rest of the list. Set it to `false` only when the later actions do not depend on the earlier ones.

`browser_batch` batches actions inside one browser session. It is unrelated to the Batch product and its `batch_*` tools.

## Session management

- Pass `session_id` to every subsequent `browser_*` call.
- Do not open multiple sessions unless the task requires it.
- Browser sessions hold concurrency slots on the user's plan. Close them promptly.
- Geo-targeting is set when the session is created. Pass `proxy_country` (ISO 3166-1 alpha-2, for example `de`) or `proxy_region` (`eu`, `na`, `ap`, `sa`, `af`, `me`) to `browser_navigate`. Later `browser_*` calls do not accept either, so set it on the first call or start a new session.

## When to prefer browser over scrape

| Scenario | Tool |
|----------|------|
| Read a static docs page | `scrape` |
| Log in, then navigate | `browser_*` |
| Click "Load more" pagination | `browser_*` |
| Fill a search form and read results | `browser_*` |
