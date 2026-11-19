# ZenRows on Mastra

[Mastra](https://mastra.ai) is a TypeScript framework for AI agents. Its
third-party tools live in its monorepo,
[mastra-ai/mastra](https://github.com/mastra-ai/mastra), as `@mastra/<vendor>`
packages under `integrations/`, each with a docs page.

So this is a **code host**: `dist/mastra/` is a slice of their repo, with every
file at the path it takes there. Nothing here is a skill or a plugin.

## What ships, and where it lands upstream

| In `dist/mastra/` | What it is |
|---|---|
| `integrations/zenrows/` | The `@mastra/zenrows` package, laid out like `@mastra/brightdata` and `@mastra/parallel` |
| `docs/src/content/en/integrations/tools/zenrows.mdx` | Its page on mastra.ai, in the house style of the Bright Data and Parallel pages |
| `docs/static/img/integrations/zenrows.svg` | The sidebar icon, drawn from `shared/assets/logo.png` |
| `.changeset/zenrows-scrape-extract-tools.md` | The changeset that releases the package as a minor version |

One edit to their tree is not a file of ours: the sidebar entry in
`docs/src/content/en/integrations/sidebars.js`, after Tavily, since the tools
are listed alphabetically. `scripts/check.sh` applies it.

## The tools

| Factory | Tool id | Returns |
|---|---|---|
| `createZenrowsScrapeTool()` | `zenrows-scrape` | `{ url, content, credits }`: the page as Markdown (default), plaintext or HTML, or the `css_extractor` fields as JSON text |
| `createZenrowsExtractTool()` | `zenrows-extract` | `{ url, data, credits }`: the fields Extract parsed out of the page (`extract=auto`), as parsed JSON |
| `createZenrowsTools()` | both | `{ zenrowsScrape, zenrowsExtract }` with shared options |

All take `{ apiKey?, baseUrl?, timeout?, fetch? }`. The key falls back to
`ZENROWS_API_KEY` and the base URL to `ZENROWS_API_URL`, then the public API.
A missing key fails when a tool runs, not when it is created, the way
`@mastra/parallel` does. The key goes in the `X-API-Key` header, never in the
URL. `credits` comes from the `X-Request-Credits` header, or is `null` without it.

`html` is the scrape tool's own `response_type` value: the API has none, and
sending no `response_type` is how it returns the HTML.

The timeout defaults to 180 s, not the 120 s Bright Data uses: the ZenRows
docs ask clients for 180 s or more, because a request can take 3 minutes and
one the client gives up on still runs, and can still be charged.

## What comes from the spec

Every fact about the API is rendered from the published spec
(https://www.zenrows.com/openapi.json) or `shared/`, so the package changes when the API does:

- **The input schemas.** `scripts/render.mjs` writes
  `integrations/zenrows/src/schemas.ts`: each parameter's type, enum, pattern
  and description from the spec, the cross-field rules included, plus the
  credit weights from `shared/text/credit-weights.md`.
- **Which parameters each tool takes.** Each tool starts from its slice in
  `shared/endpoints.yaml` (`fetch` for scrape, `extract` for extract). Every
  parameter of the slice is in the tool's `expose` list or in its `excluded`
  map with a reason, so a parameter the slice gains fails the render until
  someone decides. Scrape also takes `css_extractor`, which `GET /` has
  outside the slice; its schema still comes from the spec.
- **The base URL** is `{{api:fetch server}}`.
- **The error messages.** A `ZenrowsError` carries the status, the API's `code`,
  `reason` and `detail` from the response body, and the spec's description of
  that status (`{{api:fetch responses}}`), so the agent reads what the API
  documents rather than prose written here.
- **The tool descriptions** start from the spec's summaries
  (`{{api:fetch summary}}`, `{{api:extract summary}}`) and take the credit
  weights and the Extract pricing from `shared/text/`. Only what is specific to
  these tools (the Markdown default, which tool to use when) is written here.
  The operations' long descriptions are not used: they describe options these
  tools do not offer (screenshots, `css_extractor` on Extract).

The factories, their options, the output shapes, the Markdown default and the
docs page prose are this package's own choices, and are written by hand.

## Check it

```
npm run render
bash platforms/mastra/scripts/check.sh                 # fetches mastra at vars.yaml's upstream into .cache/mastra
bash platforms/mastra/scripts/check.sh ~/src/mastra    # or use a checkout you already have
LIVE=1 ZENROWS_API_KEY=... bash platforms/mastra/scripts/check.sh   # adds the live test
```

It copies `dist/mastra/` over the checkout, adds the sidebar entry, and in the
Node image `vars.yaml` pins (with pnpm from their `packageManager` field, through
corepack) runs their install filtered to the package, `turbo build` (which
builds `@mastra/core` first), `tsc --noEmit`, their `oxlint --type-aware`, and
vitest. Only Docker is needed on the host. The fetched checkout leaves out
`examples/` and all of `docs/` but its `package.json` and the folders the page
and icon sit in, because those are most of the monorepo. Everything else stays:
pnpm resolves the whole workspace even for a filtered install.

The unit tests inject a `fetch` mock and never call the network. The live
test (`src/__tests__/live.test.ts`) is skipped unless `ZENROWS_API_KEY` is set.
`LIVE=1` forwards `ZENROWS_API_KEY` and `ZENROWS_API_URL` into the container by
name, so the key never reaches a command line, and gives the container the
host's network, so `ZENROWS_API_URL=http://localhost:8080/v1/` reaches a local
stack.

`upstream` in `vars.yaml` pins the mastra commit. Moving it is its own pull
request, so CI (`.github/workflows/mastra.yml`) shows whether their newer code
breaks the package.

## How it ships

Landing it is a pull request to `mastra-ai/mastra` from a fork:

1. Run `bash platforms/mastra/scripts/check.sh ~/src/mastra` on a branch of
   your fork. It leaves the package, the docs page, the icon, the changeset
   and the sidebar edit in the tree.
2. Run `pnpm install` in the fork, so `pnpm-lock.yaml` gains the new
   importer, and commit that with the rest.
3. Open the pull request. They release with changesets, and the changeset
   is already in the tree.

Listing the integration waits on the Mastra partnership: do not open the
upstream pull request until that is agreed.
