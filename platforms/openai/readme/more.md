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
