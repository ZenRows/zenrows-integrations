# Changelog

## 0.1.4

- The `zenrows-extract` and `zenrows` skills no longer say `fallback_autoparse` retries with autoparse: it has had no effect since the Zenrows MCP server removed that fallback. They now handle `REQS007` by its `reason`: `domain_not_prepared` (prepare the domain with `prepare_domain`, then wait for `prepared_domain_status`), `page_not_recognised` and `domain_not_enabled`. `mode='autoparse'` is marked deprecated, and `include_html` is listed.

## 0.1.3

- The `zenrows-crawl` skill now uses the Zenrows Crawl job (`crawl_create`, `crawl_wait`, `crawl_results`) instead of a page-by-page loop built on `scrape`, so a crawl runs as one server-side job and supports `include_patterns` / `exclude_patterns`.
- The `zenrows` skill lists the `crawl_*` tools and says when to reach for them.

## 0.1.2

- ClawHub now shows OpenClaw 2026.9.8, the version this plugin was tested on, instead of the plugin's own version number.

## 0.1.1

- The `extract` skills no longer describe Extract as a beta or as gated by domain.

## 0.1.0

- First release: Zenrows MCP server (OAuth) and nine skills for OpenClaw: `zenrows`, `zenrows-scrape`, `zenrows-extract`, `zenrows-batch`, `zenrows-crawl`, `zenrows-map`, `zenrows-browser`, `zenrows-capture-api-calls` and `zenrows-getting-started`.
