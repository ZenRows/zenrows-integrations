# Changelog

## [0.2.0](https://github.com/ZenRows/zenrows-integrations/compare/claude-v0.1.6...claude-v0.2.0) (2026-11-26)


### Features

* **claude:** `using-zenrows` says never to enter payment details or complete a purchase, and lists the `account_usage` tool, which reads the account's plan and usage without changing anything. ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **claude:** Every skill states that the user's instructions take precedence over it. ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **claude:** Install with `/plugin install zenrows --marketplace ZenRows/zenrows-integrations`, where the plugin is now built; `plugin.json` points its repository there. ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **claude:** On `AUTH004` or `AUTH014` (the account's credits or the API key's credit cap used up), `getting-started` tells the user to check their usage and plan in the Zenrows dashboard. ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **claude:** The plugin description in `plugin.json`, the README intro and the opening of `using-zenrows` now say in full what Zenrows does: fetch any public page as Markdown, HTML or text, pull structured fields as JSON, run batch jobs, crawl a site from one start URL and drive a hosted browser, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **claude:** The README links the MCP server documentation, its documentation link goes to docs.zenrows.com, and the contact address is integrations@zenrows.com (was success@zenrows.com). ([47c5ce5](https://github.com/ZenRows/zenrows-integrations/commit/47c5ce5e3234e3949b7a008ac8f6f8365cca3610))
* **monid:** Zenrows connector for Monid, as a code host ([#20](https://github.com/ZenRows/zenrows-integrations/issues/20)) ([bd65d61](https://github.com/ZenRows/zenrows-integrations/commit/bd65d610be811762a87dbbf03043f40df75cb267))


### Bug Fixes

* **render:** write versioned JSON the way release-please rewrites it ([#26](https://github.com/ZenRows/zenrows-integrations/issues/26)) ([3a78cf1](https://github.com/ZenRows/zenrows-integrations/commit/3a78cf1f1b513dd0230e97edc5208893a6819229))

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
