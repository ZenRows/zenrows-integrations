# Zenrows on Monid

[monid-ai/monid](https://github.com/monid-ai/monid) is the open connector
standard behind [monid.ai](https://monid.ai), where an agent discovers, inspects
and runs tools across many vendors and Monid meters the billing in between.

Its connectors are TypeScript that lives in their tree, so this is a **code
host**: `dist/monid/connectors/zenrows/` is the connector exactly as it sits at
`connectors/zenrows` in their repo. Nothing here is a skill or a plugin.

## The two endpoints

Both sit on one wire surface, `GET https://api.zenrows.com/v1/`, with query
parameters and `X-API-Key` auth.

| Doc | What it returns |
|---|---|
| `zenrows#scrape` | The page, as Markdown (default), plaintext or HTML, or the fields named by CSS selectors |
| `zenrows#extract` | The structured fields Zenrows parsed out of the page, for a prepared domain |

Both pin `endpoint:` explicitly. They share the wire path `/`, which would
otherwise derive the same empty id for the pair.

## Billing

Zenrows meters one pool of plan credits: 1 for a plain request, 5 with
JavaScript rendering, 10 with Premium Proxies, 25 with both.

The claim arrives in the `X-Request-Credits` response header, and Monid's pure
hooks never see response headers: `usage.consolidate` gets a `zEnvelopeData`
with no header member. So `lifecycle.start` relays the call through
`utils.request()`, parses the header once and stashes it in run state, and
`usage.consolidate` and `usage.evidence` read it back at
`$.data.creditsCharged`. This is the pattern their own `cloro` and `ahrefs`
connectors use.

The rate is an identity (`PER_UNIT` on `CREDIT`, 1 per credit), so the engine's
derived fold equals the vendor's claim and a correctly metered run carries no
`usage.mismatch`.

A missing or malformed meter falls back to 25 in the evidence and omits the
pool entry in the consolidate. Never `?? 0`: a stripped header would become a
free run and leave the cost with whoever brokers it.

The hold is the caller's own configuration, not a flat ceiling. `mode=auto` is
the one input that cannot be priced ahead, so it holds 25.

## Wire rules, each confirmed against a live request

- A plain request draws 1 credit, `js_render` 5, `premium_proxy` 10, both 25.
- `mode=auto` escalates per page and bills only the configuration that
  succeeded, anywhere from 1 to 25.
- `mode=auto` cannot be combined with `js_render` or `premium_proxy`: 400 REQS004.
- `proxy_country` needs `mode=auto` or `premium_proxy` behind it. On its own,
  or beside `js_render` without `premium_proxy`, it answers 400 REQS004.
  Geotargeting draws the Premium Proxies rate of 10 credits either way,
  `mode=auto` included.
- `response_type` beside `outputs` is a 400. `css_extractor` beside `outputs`
  is served, and the `css_extractor` fields win.

Monid cannot enforce cross-field rules in the schema: refinements do not
survive `z.toJSONSchema`. So each rule is stated in the `.describe()` of the
field it constrains, which is where an agent composing a request reads it, and
the vendor answers a violation as error-as-data.

## The two edits monid's repo needs

`check.sh` applies both to the checkout before running their gate. Both are
idempotent, and both are real commits a pull request to `monid-ai/monid` must
carry.

**`shared/testing/fixtures.ts`** gets `"x-request-credits"` in
`RECORDED_RES_HEADERS`. A fixture may only carry response headers on that
allowlist, enforced by a refinement inside `loadFixture`, and a Zenrows fixture
carries the meter this connector bills from. Their own comment says growing the
list is a deliberate edit in the same pull request as the connector that needs
it. Without it the committed fixture fails to load and the billing tests cannot
run against a pinned wire shape at all.

**`connectors/ids.lock.json`** gets `zenrows#extract` and `zenrows#scrape`, in
sorted order. Doc ids are their public API and the lock is the guard against one
drifting. `deno task check && deno task test` does not read the lock, so this
edit is not what makes the gate pass. `deno task ids:check` does, and a
connector that landed without it would leave their identity guard failing for
the next person.

## Check it

```
npm run render
platforms/monid/scripts/check.sh                     # clones monid at vars.yaml's upstream into .cache/
platforms/monid/scripts/check.sh ~/path/to/monid     # or reuse a checkout you already have
SCOPE=connectors/zenrows/ platforms/monid/scripts/check.sh   # the fast loop
FMT=1 platforms/monid/scripts/check.sh               # add deno fmt --check and deno lint
LIVE=1 ZENROWS_API_KEY=... platforms/monid/scripts/check.sh  # run the live tests against the real API
```

It copies `dist/monid/connectors/zenrows` into the monid checkout, applies the
two edits above, and runs their `deno task check` and `deno task test`. The
whole suite takes about 20 minutes, so `SCOPE` is what you want while writing.
Their Deno comes from `PATH` when it is the version `vars.yaml` pins, and from
that version's container image otherwise. CI runs the same script
(`.github/workflows/monid.yml`).

Their CI runs neither `deno fmt` nor `deno lint`, but their review config says
`deno fmt` governs formatting, so `FMT=1` runs both over the connector. Their
`fmt` uses `indentWidth: 4`. The rendered output has to be formatted, not the
source, so a `{{text:…}}` snippet goes on its own line and the long string it
becomes is left alone.

The live tests are `ignored` unless a credential resolves, so an ordinary run
never calls the vendor. `LIVE=1` switches to their `test:live` task (which adds
`--allow-net`) and forwards `ZENROWS_API_KEY` into the container by name, so the
value never reaches a command line. A wrong variable name shows up as
`ignored` rather than as a pass.

`upstream` in `vars.yaml` pins the monid commit. Moving it is its own pull
request, so CI shows whether their newer code breaks the connector.

## Shared wording

Facts the Zenrows skills state too come from `shared/text/` through
`{{text:name}}`, which renders as a quoted string. Today that is the product
summary, what Adaptive Stealth Mode does, how `css_extractor` and
`response_type` interact, and what a `REQS007` `page_not_recognised` means. A
wording fix in `shared/text/` reaches the skills and the connector in the same
render.

## How it ships

Landing it in their repo is a pull request to `monid-ai/monid`. Their README
documents the process; the steps that matter here are that CI needs no vendor
keys, and that the pull request alone does not start their review.

Point `check.sh` at a checkout of your fork and it builds the submission:

```
bash platforms/monid/scripts/check.sh ~/src/monid    # your fork, on a branch
```

It copies the connector into `connectors/zenrows`, copies the change into
`openspec/changes/add-connector-zenrows`, applies the two edits above, and runs
their gate. What is left in `git status` is exactly the pull request: two new
directories, and the two one-line edits to `shared/testing/fixtures.ts` and
`connectors/ids.lock.json`.

Then email [support@monid.ai](mailto:support@monid.ai) with the pull request
link, a link to the Zenrows API docs and the company name. Their README asks
for it, they review every connector by hand, and the mail is what starts that
rather than the pull request sitting in the queue.
