# Zenrows piece for Activepieces

The Zenrows [piece](https://www.activepieces.com/docs/build-pieces/building-pieces/overview) for Activepieces: Scrape URL, an action for every other endpoint we offer, and a custom API call.

## Actions

Scrape URL is written by hand, in `src/lib/actions/scrape-url.ts`: its Output Format sets several parameters at once, a screenshot is saved as a file, custom headers go out as real headers, and it returns the cost and final URL from the response headers, none of which the spec describes. Every other endpoint we offer (`shared/billing.yaml`) gets a generated action: `scripts/render.mjs` writes each into its own `src/lib/actions/<name>.ts` from the published API spec, and `src/lib/actions/generated.ts` lists them for `index.ts`. Each has one field per parameter or body field (text, number, checkbox, a dropdown for an enum, a list for a list of strings, JSON for any other object or list). Its name, description, agent description (`aiMetadata`) and field descriptions come from `shared/actions.yaml`, because the spec's text is written for the API docs; Mastra's generated tools read the same file, so the wording is fixed once for both. Other actions read by their display names (Create Batch Job) and fields by their form labels (Cursor). The agent description ends with what the call costs, from the endpoint's kind in `shared/billing.yaml`. Whatever it leaves out comes from the spec (the summary in Title Case, the description's first paragraph). `omit` in `vars.yaml` leaves out an optional field that means nothing in Activepieces. Its `classification` (the badge Activepieces shows) follows from the method, a GET reads, a cancel or stop is destructive and any other call writes, unless `classification` in `vars.yaml` sets it; only reads are marked safe to retry. A response the API labels `text/plain` that is JSON comes back parsed, and NDJSON comes back as a list. They send the key in `X-API-Key` (as `apikey` where an endpoint takes only that) and go through the same client as Scrape URL, so errors read the same. A new endpoint in `shared/billing.yaml` becomes a new action at the next render. A custom API call covers the rest.

This is a code host (`kind: code` in `vars.yaml`). `npm run render` writes `dist/activepieces/`, which is the piece exactly as it sits in the activepieces repo (`packages/pieces/community/zenrows`): package `@activepieces/piece-zenrows`, on their workspace packages. This README stays here and isn't part of the piece.

## Shared wording

Facts that the Zenrows skills state too come from `shared/text/` through `{{text:name}}`, which renders as a quoted string. Today that's the meaning of `AUTH004`, `AUTH006`, `AUTH014` and REQS007's `page_not_recognised`, in the error hints of `src/lib/common/client.ts`. A hint can be for one `reason` of a code (`REQS007:domain_not_prepared`), when its reasons need different next steps. The piece keeps its forms short and passes the rest through: the API validates option combinations and explains every error, so the piece doesn't repeat that. A wording fix in `shared/text/` reaches the skills and the piece in the same render.

## Check it

```
npm run render
platforms/activepieces/scripts/check.sh                          # clones activepieces at vars.yaml's upstream into .cache/
platforms/activepieces/scripts/check.sh ~/path/to/activepieces   # or reuse a checkout you already have
```

It copies `dist/activepieces/` into the activepieces checkout, registers it in `tsconfig.base.json`, installs with their pinned bun, and runs their `lint`, `build` and `test` for this piece only. CI runs the same script (`.github/workflows/activepieces.yml`).

`upstream` in `vars.yaml` pins the activepieces commit. Moving it is its own PR, so CI shows whether their newer code breaks the piece.

## Try it live

Run Activepieces locally with `AP_DEV_PIECES=zenrows` and use the piece in a flow, with your Zenrows API key in the connection.

## How it ships

Not yet. First as our own npm package; then as a PR to activepieces once they agree to take it (they close outside PRs that weren't discussed with them first; see their CONTRIBUTING.md). Both release steps come in later PRs.
