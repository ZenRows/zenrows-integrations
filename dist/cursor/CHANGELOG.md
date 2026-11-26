# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/ZenRows/zenrows-integrations/compare/cursor-v0.2.2...cursor-v0.3.0) (2026-11-26)


### Features

* **cursor:** `/zenrows-doctor` lists the Crawl tools, reports the plan's usage with `account_usage`, and tells a sign-in problem (401, `AUTH003`) apart from used-up credits (`AUTH004`, `AUTH014`), where reconnecting won't help. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **cursor:** `batch` saves results to `./.zenrows/` only when the agent can write files, and `proxy_country` works with the default settings. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **cursor:** `getting-started` checks that the plugin is enabled and that Settings, Tools and MCP lists `zenrows`, walks through Connect or "Needs login", and tells sign-in problems apart from used-up credits. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **cursor:** Every skill states that the user's instructions take precedence over it. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **cursor:** New `using-zenrows` skill: an overview of every Zenrows tool and its key parameters, which tool fits a task, safety rules and what each error code means. It replaces the always-on `rules/zenrows.mdc` rule, so the guidance loads only when a task needs live web data. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **cursor:** The plugin description and README say in full what Zenrows does, the README has Requirements, Setup, Privacy and Support sections, and the contact address is integrations@zenrows.com (was support@zenrows.com). ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **monid:** Zenrows connector for Monid, as a code host ([#20](https://github.com/ZenRows/zenrows-integrations/issues/20)) ([bd65d61](https://github.com/ZenRows/zenrows-integrations/commit/bd65d610be811762a87dbbf03043f40df75cb267))


### Bug Fixes

* **cursor:** Skills no longer pass `mode='auto'` to `scrape`, which has no `mode` parameter; Zenrows adds JavaScript rendering or premium proxies on its own when a page needs them. ([77f0979](https://github.com/ZenRows/zenrows-integrations/commit/77f0979efb103af984b8aa8e336bb32fa330b279))
* **render:** write versioned JSON the way release-please rewrites it ([#26](https://github.com/ZenRows/zenrows-integrations/issues/26)) ([3a78cf1](https://github.com/ZenRows/zenrows-integrations/commit/3a78cf1f1b513dd0230e97edc5208893a6819229))

## [0.2.2] - 2026-10-27

### Fixed

- The `extract` skill and `rules/zenrows.mdc` no longer say `fallback_autoparse` retries with autoparse: it has had no effect since the Zenrows MCP server removed that fallback. They now handle `REQS007` by its `reason`: `domain_not_prepared` (prepare the domain with `prepare_domain`, then wait for `prepared_domain_status`), `page_not_recognised` and `domain_not_enabled`. `mode='autoparse'` is marked deprecated, and `include_html` is listed.

### Changed

- The `crawl` skill now uses the Zenrows Crawl job (`crawl_create`, `crawl_wait`, `crawl_results`) instead of a page-by-page loop built on `scrape`, so a crawl runs as one server-side job and supports `include_patterns` / `exclude_patterns`.
- `rules/zenrows.mdc` lists the `crawl_*` tools. They were missing, so agents were not told Crawl existed.

## [0.2.1] - 2026-10-14

### Changed

- The `extract` skill and the rules no longer describe Extract as a beta or as gated by domain.
- Plugin logo replaced with the current brand app icon from the [media kit](https://www.zenrows.com/media). The previous `assets/logo.png` was a superseded mark that appears nowhere in the brand asset set.

## [0.2.0] - 2026-08-26

### Added

- `batch` skill covering the `batch_create`, `batch_status`, `batch_wait`, `batch_results` and `batch_cancel` tools, for processing a known list of URLs as one managed job.

### Changed

- `extract-structured-data` now uses the dedicated `extract` tool instead of `scrape` parameters, and documents the `mode` / `mode_auto` distinction and the Extract open-beta `AUTH010` fallback.
- `rules/zenrows.mdc` lists the full hosted tool surface: `scrape`, `extract`, `batch_*` and `browser_*`. It previously named only `scrape` and `browser_*`, so agents were not told Extract and Batch existed.
- Product naming brought to the current primitives: Fetch, Extract, Batch and Browser Sessions. "Universal Scraper API" and "Scraping Browser" removed.
- Brand spelling standardised on "Zenrows".
- MCP config renamed from `.mcp.json` to `mcp.json`, the filename Cursor's plugin template expects.
- `scripts/local-install.sh` now symlinks into `~/.cursor/plugins/local/zenrows`, Cursor's documented local plugin path. It previously copied to `~/.cursor/plugins/zenrows` and wrote to `~/.claude`.
- Documentation links updated to the current docs paths.

### Removed

- `.zenrows.env.example`. The plugin authenticates by OAuth and never uses `ZENROWS_API_KEY`.

## [0.1.0] - 2026-05-28

### Added

- Initial Cursor plugin for Zenrows
- Connects to the hosted Zenrows MCP server over OAuth (no API key, no environment variable, no local server)
- Always-on rule (`rules/zenrows.mdc`) covering tool selection, security, and error handling
- Task skills: `scrape-webpage`, `extract-structured-data`, `crawl`, `map`, `browser-automation`, `capture-api-calls`, `getting-started`
- `/zenrows-doctor` command to check connection and authorization status
- `AGENTS.md` orientation for contributors and coding agents

### Notes

- Authentication is handled by the MCP client via OAuth. Cursor opens a browser for login and refreshes the token automatically. End users do not need Node.js, since there is no local server to launch.
- `scrape` defaults to `mode='auto'` (Adaptive Stealth Mode), which manages JavaScript rendering and anti-bot escalation automatically and bills only for the configuration that succeeds.
- Bulk skills (`crawl`, `map`) write output to a gitignored `./.zenrows/` directory and read it incrementally rather than loading it into context.
