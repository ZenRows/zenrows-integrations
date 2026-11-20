# Changelog

## [0.2.0](https://github.com/ZenRows/zenrows-integrations/compare/openai-v0.1.8...openai-v0.2.0) (2026-11-20)


### Features

* **monid:** Zenrows connector for Monid, as a code host ([#20](https://github.com/ZenRows/zenrows-integrations/issues/20)) ([bd65d61](https://github.com/ZenRows/zenrows-integrations/commit/bd65d610be811762a87dbbf03043f40df75cb267))
* **openai:** `getting-started` names ChatGPT and Codex, and on a 401 or `AUTH003` asks the user to reconnect Zenrows the same way they first connected it. ([3041d76](https://github.com/ZenRows/zenrows-integrations/commit/3041d76a7f3c5344727c2100d925cc5f89299896))
* **openai:** The plugin description in `plugin.json`, the README intro and the opening of `using-zenrows` now say in full what Zenrows does: fetch any public page as Markdown, HTML or text, pull structured fields as JSON, run batch jobs, crawl a site from one start URL and drive a hosted browser, with proxies, JavaScript rendering and anti-bot protection handled by Zenrows. ([3041d76](https://github.com/ZenRows/zenrows-integrations/commit/3041d76a7f3c5344727c2100d925cc5f89299896))
* **openai:** The README has a Setup section: install Zenrows from the plugins directory in ChatGPT or Codex, sign in when the model first asks to use it, then try the example prompt. ([3041d76](https://github.com/ZenRows/zenrows-integrations/commit/3041d76a7f3c5344727c2100d925cc5f89299896))
* **openai:** The README links the MCP server documentation, and the contact address is integrations@zenrows.com (was success@zenrows.com). ([3041d76](https://github.com/ZenRows/zenrows-integrations/commit/3041d76a7f3c5344727c2100d925cc5f89299896))


### Bug Fixes

* **render:** write versioned JSON the way release-please rewrites it ([#26](https://github.com/ZenRows/zenrows-integrations/issues/26)) ([3a78cf1](https://github.com/ZenRows/zenrows-integrations/commit/3a78cf1f1b513dd0230e97edc5208893a6819229))

## 0.1.8

- The `extract` skills no longer say `fallback_autoparse` retries with autoparse: it has had no effect since the Zenrows MCP server removed that fallback. They now handle `REQS007` by its `reason`: `domain_not_prepared` (prepare the domain with `prepare_domain`, then wait for `prepared_domain_status`), `page_not_recognised` and `domain_not_enabled`. `mode='autoparse'` is marked deprecated, and `include_html` is listed.

## 0.1.7

- `review.demo_recording_url` points to the demo video, which OpenAI requires for plugins with an MCP server. The video runs the 8 review cases in ChatGPT on 0.1.6.
- The long description no longer ends with "Usage counts against your Zenrows plan.". The portal flagged it under "Remove pricing, subscription offers, and temporary promotions from the description."
- The release notes describe the plugin instead of the 0.1.2 change to the `extract` skill.

## 0.1.6

- The three starter prompts start with "Use Zenrows to", like the positive review cases. In ChatGPT on 2026-10-19, "List the pages linked from https://www.scrapingcourse.com/ecommerce/" read the Map and Crawl skills, then answered from web search without calling a Zenrows tool.

## 0.1.5

- Review case 3 expects `batch_create` only. In ChatGPT on 2026-10-19, `batch_create` waited for the job to finish and returned its counts (5 successful, 0 failed), so ChatGPT answered without calling `batch_results`, which the case required. `batch_status`, `batch_wait` and `batch_results` stay acceptable follow-ups.

## 0.1.4

Review cases run in Codex (ChatGPT desktop) on 2026-10-18, each in a new chat, against mcp.zenrows.com 2.12.0.

- Every positive case starts with "Use Zenrows to". Without it, Codex answered case 2 with its built-in web search and never called the plugin. The negative cases stay as they were, since they check that the plugin is not used.
- Case 2 asks for the first page of `/ecommerce/` only. The old prompt called `extract`, then walked all 12 catalog pages: about 30 calls, 1 min 46 s and 188 products, against an expected 16. The starter prompt with the same wording changes too.
- Case 4 asks for the price of the Kenobi Trail Jacket ($47), which only appears after Load more. The old question, the last three products, ends on an item the site itself renders as `Mars HeatTech&trade; Pullover`, and Codex left it out of its answer. Its tool list accepts `browser_batch`, which Codex used for the click, as well as `browser_click`.
- Case 5 expects no purchase or upgrade links, which `account_usage` stopped returning in zenrows-mcp 2.7.0.

## 0.1.3

- Review case 4 read page 2 of `/ecommerce/`, which has its own URL, so ChatGPT answered it with `scrape` and never opened a browser session. It now uses `/button-click`, where the answer only appears after clicking Load more.
- Review case 2 names what a correct answer contains: the 16 products on the page, from Abominable Hoodie ($69.00) to Artemis Running Short ($45.00).

## 0.1.2

- The `extract` skills no longer describe Extract as a beta or as gated by domain.

## 0.1.1

- Review cases checked against the live MCP server on 2026-10-13. Case 1 read `scrapingcourse.com/javascript-rendering/`, which `scrape` returns as an "Enable JavaScript" placeholder with default settings; it now reads `/table-parsing`, which returns its full table. Case 3 expected page titles, which `batch_results` doesn't return (it returns a status and a download link per URL); it now expects per-URL status.
- The starter prompt that used `/javascript-rendering/` uses `/table-parsing` instead.

## 0.1.0

- First version: the Zenrows MCP server (OAuth sign-in) and nine skills: `using-zenrows`, `getting-started`, `scrape-webpage`, `extract-structured-data`, `batch`, `crawl`, `map`, `browser-automation` and `capture-api-calls`.
- Skills come from `ZenRows/claude-zenrows` 0.1.2, with Claude-specific wording replaced by provider-neutral wording, as OpenAI asks for imported Claude plugins.
- `crawl` uses the `crawl_*` tools added in `zenrows-mcp` 2.6.0 instead of a `scrape` loop. `using-zenrows` lists the `crawl_*` and `account_usage` tools.
- Every skill states that the user's instructions take precedence over it, as OpenAI's instruction-following guidance recommends.
- `plugin.json` carries the listing, five positive and three negative review cases, commerce declaration and release notes.
- `scripts/validate.mjs` checks the package against OpenAI's documented submission limits; `scripts/package.sh` builds the upload ZIP.
