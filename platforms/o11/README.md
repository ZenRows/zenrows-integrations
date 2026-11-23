# Zenrows on o11.ai

[o11.ai](https://o11.ai) sells API calls to agents. Our listing there is `dist/o11/o11.yaml`, in o11's [listing format](https://docs.o11.ai/listing-file/index.md): who we are, the Zenrows endpoints buyers can call, and what each costs. o11 calls our API directly with a Zenrows API key; there's no connector code.

It's a code host, and the listing is generated. Edit these, never `dist/o11/`:

| File | What's in it |
|---|---|
| `scripts/o11.yaml` | the listing's fixed parts, as YAML: provider, base URL and key, coverage, and the three price blocks (`per_credit`, `unresolved`, `free`) with their text |
| `shared/billing.yaml` | which endpoints we offer (to every host, not only o11) and how each is billed; every other API operation is under `not_offered`, which the listing's `coverage.excluded` comes from |
| `scripts/render.mjs` | adds one endpoint per offered API endpoint, with every field from the spec (id, name, description, base URL, key, parameters, example), and the price block for its billing kind |

`GET /` is listed as the shared Fetch and Extract endpoints (`shared/endpoints.yaml`). Where the spec has no description, the listing uses its summary. The contact email comes from `shared/vars.yaml`, and the pricing facts in the price blocks from `shared/text/`. The listing has no `fixtures` (sample calls): they're optional in o11's format, and the spec doesn't pair requests with responses.

## What's listed

Fetch, Extract (and its domain preparation), Batch and Crawl. Fetch and Extract are priced per credit used, read from the `X-Request-Credits` response header, at the public pay-as-you-go rate cited with the [pricing page](https://docs.zenrows.com/first-steps/pricing). Starting a Batch job or a crawl is `unresolved`: they're billed after they run, so o11's team settles their price in review. Reading and managing what was created is free. What we left out, with the reason, is under `coverage.excluded`.

**Before submitting, GTM confirms the prices.** Tech owns the rest.

## Releasing and submitting

A merged change to the listing (or to a `shared/text/` fact it uses) opens an `o11` release PR. Merging it releases `o11-v<version>`, and #proj-integrations gets a reminder to upload it (`upload:` in `vars.yaml`). Then:

1. Install the o11 provider CLI (0.1.23 or later; [instructions](https://docs.o11.ai/provider-onboarding/index.md)) and sign in: `o11-provider login --server https://go.o11.ai`.
2. Send `dist/o11/o11.yaml` from the release tag. o11 replies with a review link.
3. Open the link, check the endpoints and prices, and select **Submit for review**. Track it with `o11-provider status --id <submission id> --server https://go.o11.ai`.
4. The first time, send the Zenrows API key in o11's private account step. Never put a key in the listing.

o11 reviews every version, and the live one keeps running until the new one is approved.

## Keeping it current

The listing follows the spec on its own: a new parameter, a reworded description or a new base URL changes it at the next render. A new API operation fails the render until it's placed in `shared/billing.yaml`, as offered (with its billing kind) or `not_offered`. When prices change, update the `shared/text/` facts, the price blocks in `scripts/o11.yaml`, the numbers in `vars.yaml` and `observed_at`. `npm run validate` checks the listing against o11's schema.
