# Zenrows for ChatGPT and Codex

Live web data for ChatGPT and Codex. This plugin connects them to the Zenrows MCP server, so the model can read the current content of any public page, pull structured fields from it, run batch jobs over many URLs, crawl from a start page, and drive a hosted browser for pages that need clicks, forms or pagination. It also adds skills that tell the model which Zenrows tool fits each task and how to keep requests efficient.

## What you get

- The Zenrows MCP server (`https://mcp.zenrows.com/mcp`). You sign in to your Zenrows account with OAuth; there is no API key to copy.
- Nine skills:

| Skill | Use it for |
|---|---|
| `using-zenrows` | Overview: tools, defaults, errors and plan limits |
| `getting-started` | First-run checks and troubleshooting (the plugin's onboarding skill) |
| `scrape-webpage` | Reading one page |
| `extract-structured-data` | Named fields or JSON from one page |
| `batch` | A list of five or more URLs as one job |
| `crawl` | Many pages behind one start URL, with the Crawl tools |
| `map` | Listing a site's URLs from its sitemap without fetching them |
| `browser-automation` | Clicks, forms, pagination and multi-step flows |
| `capture-api-calls` | Finding the API calls a page makes |

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Privacy

The plugin sends the URLs and options you ask the model to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## For maintainers

The package follows OpenAI's [plugin package format](https://developers.openai.com/plugins/build/plugins): a root `plugin.json` (Agent Plugins schema, with the listing, review and publication fields under `extensions.com.openai`), a root `mcp.json`, `skills/` and `assets/`.

```
npm run validate              # includes the submission limits, from platforms/openai/scripts/validate.mjs
npm run package -- openai     # validates, then builds .cache/packages/openai-zenrows-<version>.zip
```

`platforms/openai/scripts/validate.mjs` in [zenrows-integrations](https://github.com/ZenRows/zenrows-integrations) encodes the limits from OpenAI's [manifest field reference](https://developers.openai.com/plugins/deploy/submission#automatically-provide-submission-and-review-information) and [submission error reference](https://developers.openai.com/plugins/deploy/submission-errors). CI runs it on every push.

Things to know before submitting:

- **Reviewer credentials never go in this repo.** OpenAI rejects `test_credentials` and `reviewer_instructions` in the package; they are entered in the portal's Review details form.
- **Run the review test cases with the reviewer test account before submitting.** OpenAI asks for it. Update `expected_behavior` to match what actually happens.
- **`demo_recording_url` must open without signing in.** It is required for MCP review.
- **`mcp.json` declares OAuth under `extensions.com.openai.auth`**, as OpenAI's [authentication reference](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication) says. The generic Agent Plugins MCP schema doesn't list `extensions` on a server; OpenAI's own examples combine both, so this follows OpenAI.
- **The tool scan reads the live server.** Every tool on `mcp.zenrows.com` needs `readOnlyHint`, `destructiveHint` and `openWorldHint` before submission ([ZenRows/zenrows-mcp#43](https://github.com/ZenRows/zenrows-mcp/pull/43)).
- **Bump `version` and add a `CHANGELOG.md` entry for every upload.** OpenAI requires a new version for each release.

## License

MIT
