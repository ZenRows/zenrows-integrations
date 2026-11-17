# Changelog

## 0.1.6

- The `extract` skills no longer say `fallback_autoparse` retries with autoparse: it has had no effect since the Zenrows MCP server removed that fallback. They now handle `REQS007` by its `reason`: `domain_not_prepared` (prepare the domain with `prepare_domain`, then wait for `prepared_domain_status`), `page_not_recognised` and `domain_not_enabled`. `mode='autoparse'` is marked deprecated, and `include_html` is listed.

## 0.1.5

- The plugin description (in `plugin.json` and `marketplace.json`) and the README name Crawl next to fetch, extract, batch and browser sessions, so the directory listing shows it.

## 0.1.4

- The `crawl` skill now uses the Zenrows Crawl job (`crawl_create`, `crawl_wait`, `crawl_results`) instead of a page-by-page loop built on `scrape`, so a crawl runs as one server-side job and supports `include_patterns` / `exclude_patterns`.
- `using-zenrows` lists the `crawl_*` tools and says when to reach for them.

## 0.1.3

- The `extract` skills no longer describe Extract as a beta or as gated by domain.

## 0.1.2

- `plugin.json` sets the documentation, support, privacy policy and terms URLs, so the directory listing doesn't read them from the README with the trailing full stop attached.
- README links are Markdown links.
- `plugin.json` sets the listing icon to the Zenrows logo.

## 0.1.1

- Skills tell Claude to reconnect only on `401` or `AUTH003`. `AUTH004`, `AUTH014` and `AUTH006` are plan limits that reconnecting doesn't clear.
- `extract` skills also recognise `REQS007` for a domain Extract hasn't prepared.
- `getting-started` points to **Customize → Connectors** in Claude.
- Contact email is success@zenrows.com.

## 0.1.0

- First release: the Zenrows MCP server (OAuth sign-in) and nine skills: `using-zenrows`, `getting-started`, `scrape-webpage`, `extract-structured-data`, `batch`, `crawl`, `map`, `browser-automation` and `capture-api-calls`.
