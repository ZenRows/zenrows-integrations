# Zenrows piece for Activepieces

The Zenrows [piece](https://www.activepieces.com/docs/build-pieces/building-pieces/overview) for Activepieces: Scrape URL, Extract structured data, Get account usage, and a custom API call.

This is a code host (`kind: code` in `vars.yaml`). `npm run render` writes `dist/activepieces/`, which is the piece exactly as it sits in the activepieces repo (`packages/pieces/community/zenrows`): package `@activepieces/piece-zenrows`, on their workspace packages. This README stays here and isn't part of the piece.

## Shared wording

Facts that the Zenrows skills state too come from `shared/text/` through `{{text:name}}`, which renders as a quoted string. Today that's the meaning of `AUTH004` and `AUTH014`, in `src/lib/common/client.ts`. The piece keeps its forms short and passes the rest through: the API validates option combinations and explains every error, so the piece doesn't repeat that. A wording fix in `shared/text/` reaches the skills and the piece in the same render.

## Check it

```
npm run render
platforms/activepieces/scripts/check.sh                          # clones activepieces at vars.yaml's upstream into .cache/
platforms/activepieces/scripts/check.sh ~/path/to/activepieces   # or reuse a checkout you already have
```

It copies `dist/activepieces/` into the activepieces checkout, registers it in `tsconfig.base.json`, installs with their pinned bun, and runs their `lint`, `build` and `test` for this piece only. CI runs the same script (`.github/workflows/activepieces.yml`).

`upstream` in `vars.yaml` pins the activepieces commit. Moving it is its own PR, so CI shows whether their newer code breaks the piece.

## Try it live

```
platforms/activepieces/scripts/smoke.sh
```

It builds the piece as above, asks for your Zenrows API key (kept in that process only), then runs each action against the live API with a fake Activepieces context: Scrape URL as Markdown, a screenshot and a JSON page, Extract by CSS and automatic on a listing and a product page, Get Account Usage, Custom API Call, and two failures that should show the API's code with our hint. Each run spends a few credits, so it isn't in CI. It can't check the forms; for those, run Activepieces locally with `AP_DEV_PIECES=zenrows`.

## How it ships

Not yet. First as our own npm package; then as a PR to activepieces once they agree to take it (they close outside PRs that weren't discussed with them first; see their CONTRIBUTING.md). Both release steps come in later PRs.
