---
name: extract-structured-data
description: 'Pull specific data fields from one page rather than its full content: prices, product attributes, article fields, or table rows. Use when the user names the fields they want or asks for structured JSON from a single URL. Not for reading a page''s prose (use scrape-webpage), not for discovering a site''s URLs (use map), not for many pages by following links (use crawl), and not for a list of URLs the user already has (use batch).'
---

# Extract structured data

The user's instructions take precedence over this skill. If they conflict, follow the user.

Use the dedicated `extract` tool, not `scrape`. It returns structured JSON directly.

## Instructions

1. Identify, or infer from context, the fields the user needs.
2. Choose the extraction mode:
   - `mode='auto'` (default): Zenrows decides the structure. Best when the user has not named exact fields.
   - `mode='css'` with `css_extractor`: named fields you can select, for example `css_extractor='{"title":"h1","price":".price"}'`. Required whenever `mode='css'`.
   - `mode='autoparse'`: deprecated. Use it only when the user asks for autoparse by name.
3. Add page-loading options only when the page needs them: `js_render=true` for SPAs, `mode_auto=true` or `premium_proxy=true` when a plain request does not load the page, `proxy_country` for geo-restricted content. `wait_for` and `wait` both require `js_render`.
4. Return the JSON formatted for the user's purpose: display, file export, or code.

## Two traps

- **`mode` selects the extraction strategy** (`auto`, `autoparse`, `css`). It is not the adaptive request setting, which is the separate boolean `mode_auto` and is on by default. `scrape` has no `mode` parameter at all.
- **`extract` with `mode='auto'` works on any domain Zenrows has prepared, with any API key.** There is no per-account gate. When it can't extract a page it returns `REQS007` (or the older `AUTH010`) with a `reason`, and nothing is charged:
  - `domain_not_prepared`: call `prepare_domain` with the domain and 1 to 5 example URLs, one per kind of page the user wants (for example one product page and one listing page). It costs no credits and takes a few minutes. Poll `prepared_domain_status` about every 30 seconds until `status` is `ready`, then call `extract` again. Each new domain uses one slot of the account's monthly allowance, which `prepared_domain_status` shows. If the user can't wait, use `mode='css'` meanwhile.
  - `page_not_recognised`: the domain is prepared, but this page has nothing Extract extracts (a home or search page, for example). Try a product, article or listing page on the same site. If this page should work, retry it once after a few minutes, not in a loop; otherwise use `mode='css'`. Don't call `prepare_domain`: it doesn't change this answer.
  - `domain_not_enabled`: preparing doesn't help. Use `mode='css'`, or tell the user to contact Zenrows support to have the site enabled.
- **`fallback_autoparse` is deprecated and has no effect.** Extract no longer falls back to autoparse. Don't set it; if you do, the result only carries a note saying it was ignored.

## When to use `scrape` instead

`extract` returns fields. For bulk content of one type across a page (every link, every email, every image), `scrape` with `outputs='emails,links'` or `outputs='*'` is the right call.

## Parameter guide

| Need | Parameter | Example |
|------|-----------|---------|
| Let Zenrows infer structure | `mode` | `mode='auto'` (default) |
| Named fields via CSS | `mode` + `css_extractor` | `mode='css'`, `css_extractor='{"title":"h1"}'` |
| Domain not prepared yet (`REQS007`, `domain_not_prepared`) | `prepare_domain`, then `prepared_domain_status` | see "Two traps" |
| JS-rendered page | `js_render` | `js_render=true` |
| Plain request does not load the page | `mode_auto` or `premium_proxy` | `mode_auto=true` |
| Geo-restricted | `proxy_country` | `proxy_country='de'` (needs `premium_proxy` or `mode_auto`) |
