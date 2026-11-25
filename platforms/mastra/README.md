# Zenrows on Mastra

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
| `docs/src/content/en/integrations/tools/zenrows.mdx` | Its page on mastra.ai, in the house style of the Bright Data and Parallel pages, rendered from `scripts/docs-page.mdx` with the generated tools' table added |
| `docs/static/img/integrations/zenrows.svg` | The sidebar icon, drawn from `shared/assets/logo.png` |
| `.changeset/zenrows-tools.md` | The changeset that releases the package as a minor version: `package.json` starts at `0.0.0`, as their new packages do, so the first release is `0.1.0` (`0.1.0-alpha.0` while their prerelease mode is on, as `@mastra/parallel`'s was) |

One edit to their tree is not a file of ours: the sidebar entry in
`docs/src/content/en/integrations/sidebars.js`, after Tavily, since the tools
are listed alphabetically. `scripts/check.sh` applies it.

## The tools

| Factory | Tool id | Returns |
|---|---|---|
| `createZenrowsScrapeTool()` | `zenrows-scrape` | `{ url, content, credits }`: the page as Markdown (default), plaintext or HTML, or the `css_extractor` fields as JSON text |
| `createZenrowsExtractTool()` | `zenrows-extract` | `{ url, data, credits }`: the fields Extract parsed out of the page (`extract=auto`), as parsed JSON |
| `createZenrows<Name>Tool()` | `zenrows-<name>` | One generated tool for every other endpoint we offer (see below) |
| `createZenrowsTools()` | all | `{ zenrowsScrape, zenrowsExtract, … }`: every tool, with shared options |

Scrape and extract are written by hand. Every other endpoint in
`shared/billing.yaml` that isn't `not_offered` gets a generated tool in
`integrations/zenrows/src/generated/`, the way the Activepieces piece gets its
actions: batch jobs, crawls and Extract domain preparation today (13 tools). A
new endpoint there becomes a new tool at the next `npm run render`, with nothing
to decide here. Each generated tool takes the endpoint's path, query and body
fields as one input object, and returns the API's answer: JSON parsed, text as a
string, any other body (a PDF) as `{ contentType, base64 }`, and `null` for an
empty one. Batch and crawl are background jobs: an agent starts one, then reads
it with the matching tools, as a flow does in Activepieces.

All take `{ apiKey?, baseUrl?, timeout?, fetch? }`. The key falls back to
`ZENROWS_API_KEY` and the base URL to `ZENROWS_API_URL`, then the public API.
A missing key fails when a tool runs, not when it is created, the way
`@mastra/parallel` does. The key goes in the `X-API-Key` header, never in the
URL, except for an endpoint the spec says takes it only as `apikey`. `baseUrl`
replaces the public API's server (`api.zenrows.com`) and only it: the batch
tools keep the batch server the spec names. `credits` comes from the `X-Request-Credits` header, or is `null` without it.

`html` is the scrape tool's own `response_type` value: the API has none, and
sending no `response_type` is how it returns the HTML.

The timeout defaults to 180 s, not the 120 s Bright Data uses, for the reason
`shared/text/request-timeout.md` gives; the timeout error and the docs page
say it in those words.

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
- **The generated tools**, whole: each one's inputs (nested objects, lists and
  `oneOf` included), its server, path and where it takes the key, what each
  response status means, and its description: the spec's summary, the first
  paragraph of its description, then how it's billed. The billing sentence comes
  from its kind in `shared/billing.yaml`, through `shared/text/billing-free.md`
  or `shared/text/billing-after-run.md` and the credit weights; a kind with no
  sentence fails the render. Mastra's oxfmt config skips `**/generated/**`, so
  these files are written plainly rather than in oxfmt's layout.
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

`scripts/render.mjs` writes the base URL, the status descriptions, the
summaries and the `shared/text/` snippets as constants in
`integrations/zenrows/src/spec.ts`, and the source files import them. Both
generated files come out the way Mastra's oxfmt config formats them (single
quotes, 120 columns); a placeholder in a hand-written file would render as a
double-quoted JSON string that oxfmt rewrites.

The factories, their options, the output shapes, the Markdown default and the
docs page prose are this package's own choices, and are written by hand.

When a spec change breaks the render, `scripts/render.mjs` says "the API spec"
in its error, which is what `.github/workflows/api-changed.yml` looks for to open
its "API change: hosts to update" issue rather than fail as a broken run.

## Check it

```
npm run render
bash platforms/mastra/scripts/check.sh                 # fetches mastra at vars.yaml's upstream into .cache/mastra
bash platforms/mastra/scripts/check.sh ~/src/mastra    # or use a checkout you already have
GATES=format,vale bash platforms/mastra/scripts/check.sh            # only those gates
DOCS_BUILD=1 bash platforms/mastra/scripts/check.sh                 # adds the docs site build
LIVE=1 ZENROWS_API_KEY=... bash platforms/mastra/scripts/check.sh   # adds the live test
```

`check.sh` exits 0 only when the pull request that adds `dist/mastra/` would
pass Mastra's own CI (`.github/workflows/lint.yml` and `lint-docs.yml` at the
pinned commit). It copies `dist/mastra/` over the checkout and adds the sidebar
entry. Then `scripts/gates.sh` runs in the Node image `vars.yaml` pins, the
Node their CI sets up, with pnpm from their `packageManager` field through
corepack. Only Docker is needed on the host. Each gate is named, a failure
says which, and a summary lists them all at the end:

| Gate | What it runs, as their CI does |
|---|---|
| `install` | `pnpm install` for the package, the root and the docs site |
| `lockfile` | `pnpm-lock.yaml` has the `integrations/zenrows` importer, and `pnpm install --frozen-lockfile` (their CI's install) accepts it |
| `commit` | Commits everything as one commit on the pinned tree, the pull request, so the gates that diff against the base see it |
| `format` | Their `lint:format` (oxfmt) on the changed files, then the same oxfmt config without the patterns that skip `integrations/` and `.changeset/` |
| `build`, `typecheck`, `lint`, `test` | `turbo build` (which builds `@mastra/core` first), `tsc --noEmit`, `oxlint --type-aware`, vitest |
| `clean-worktree` | `check-clean-worktree.bash`: the build leaves nothing uncommitted |
| `package-json` | `validate-pkg-json.mjs` |
| `changesets` | `check-changeset-packages.mjs` and `changeset status --since <base>`, and prints the version the release would get |
| `readmes` | `check-package-readmes.mjs`: the README's sections, links and the `CHANGELOG.md` |
| `agents-md` | `validate-agents-md.mjs` (no package of this kind has an `AGENTS.md`, so it checks theirs) |
| `peer-deps` | Their peer dependency job: `changeset pre exit`, `changeset version`, `validate-peerdeps.mjs`, `check:core-imports`, and nothing changed |
| `bundle` | `e2e-tests/pkg-outputs`: the exports, extensions and bundling of every built package |
| `docs-check`, `docs-validate` | `pnpm check --no-vale` and `pnpm validate` in `docs/` |
| `redirects` | `generate-vercel-redirects` changes nothing, `validate-redirects.js`, `check-deleted-pages.js` |
| `vale` | Vale 3.27.0 on the changed MDX with their CI config and `docs/styles`, failing on errors; warnings and suggestions are printed after |
| `docs-build` | `pnpm build` in `docs/` (Docusaurus), with `DOCS_BUILD=1` only, because it is slow |
| `npm-exists` | `check-npm-packages-exist.mjs --since <base>`, report only: see below |

The fetched checkout has their full history, as their CI checks it out
(`changeset version` never ends in a shallow clone), and leaves out
`examples/`, which is most of the tree and no workspace package.

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
   your fork. It ends with one commit on that branch, `feat(zenrows): add
   @mastra/zenrows`: the package, the docs page, the icon, the changeset, the
   sidebar edit and `pnpm-lock.yaml` with the new importer. Running it again
   replaces that commit.
2. Open the pull request. They release with changesets, and the changeset
   is already in the tree.
3. Ask a Mastra maintainer to publish the `@mastra/zenrows` placeholder to npm
   before the merge. Their "New packages exist on npm" job fails for a package
   npm has never seen, because their release publishes through npm trusted
   publishing, which only works on a package that already exists, and only
   their maintainers can create it (`scripts/npm-placeholder-publish.mjs` in their
   repo). `check.sh` runs that check but only reports it.

Listing the integration waits on the Mastra partnership: do not open the
upstream pull request until that is agreed.
