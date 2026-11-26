# Changelog

## [0.2.0](https://github.com/ZenRows/zenrows-integrations/compare/openclaw-v0.1.4...openclaw-v0.2.0) (2026-11-26)


### Features

* **openclaw:** `zenrows-batch` saves results to `./.zenrows/` only when the agent can write files, and `proxy_country` works with the default settings. ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))
* **openclaw:** `zenrows-getting-started` checks the plugin with `openclaw plugins inspect zenrows`, gives the `openclaw mcp set` and `openclaw mcp login` steps up front, and tells a sign-in problem (401, `AUTH003`) apart from used-up credits (`AUTH004`, `AUTH014`), where reconnecting won't help. ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))
* **openclaw:** Every skill states that the user's instructions take precedence over it. ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))
* **openclaw:** The `zenrows` overview skill lists the `account_usage` tool, which reads the account's plan and usage without changing anything. ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))
* **openclaw:** The plugin description in `package.json`, `openclaw.plugin.json` and the README says in full what Zenrows does, the README says it needs Node.js 24.16 or newer, and the contact address is integrations@zenrows.com (was support@zenrows.com). ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))


### Bug Fixes

* **openclaw:** Skills no longer pass `mode='auto'` to `scrape`, which has no `mode` parameter; Zenrows adds JavaScript rendering or premium proxies on its own when a page needs them. ([4b80c9a](https://github.com/ZenRows/zenrows-integrations/commit/4b80c9ac78dfdb52562a38f11f62f80e11ca3fd5))

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
