// Builds dist/o11/o11.yaml from o11.yaml next to this file (the listing's fixed
// parts) and the published API spec: one endpoint per operation we offer
// (shared/billing.yaml), with every field from the spec and the price block for its
// billing kind. npm run render runs it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

const inputKeys = { query: "queryParams", path: "pathParams", body: "body" };

export default function render({ values, fill, apiEndpoints, apiNotOffered }) {
  const text = fill(readFileSync(join(import.meta.dirname, "o11.yaml"), "utf8"));
  const { prices, excludedReason, ...listing } = parse(text);
  // The most one request can cost.
  prices.per_credit.price.maximumMicros = Number(values.credit_price_micros) * Number(values.request_max_credits);
  const api = listing.listings[0];

  // The endpoints we offer, and what we don't, are shared (shared/billing.yaml); each
  // endpoint gets the price block for its billing kind.
  const endpoints = apiEndpoints();
  const priceOf = (e) => {
    if (!prices[e.billing]) throw new Error(`platforms/o11/scripts/o11.yaml: prices has no block for ${e.billing}`);
    return prices[e.billing];
  };

  // An endpoint takes the listing's key unless the spec says it can't; then it
  // gets its own, the first place the spec gives.
  const listingKey = api.auth.kind === "query" ? api.auth.queryParam : api.auth.headerName;
  const ownKey = ([kind, name]) => (kind === "query" ? { kind, queryParam: name } : { kind, headerName: name });
  api.endpoints = endpoints.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    ...(e.server !== api.baseUrl ? { baseUrl: e.server } : {}),
    ...(e.keyIn[api.auth.kind] === listingKey ? {} : { auth: ownKey(Object.entries(e.keyIn)[0]) }),
    method: e.method,
    path: e.path,
    input: Object.fromEntries(Object.entries(e.input).map(([part, schema]) => [inputKeys[part], schema])),
    effect: e.method === "GET" ? "read" : "write",
    ...(Object.keys(e.example).length ? { example: e.example } : {}),
    ...priceOf(e),
  }));
  api.coverage.included = api.endpoints.map((e) => ({ endpointId: e.id, sources: [values.openapi_url] }));
  api.coverage.excluded = apiNotOffered().map((operation) => {
    const [method, path] = operation.split(" ");
    return { method, path, reason: excludedReason };
  });

  const header = text.split("\n")[0];
  return { "o11.yaml": `${header}\n# Generated from platforms/o11/scripts/o11.yaml, vars.yaml and the API spec; edit those, not this file.\n${stringify(listing, { lineWidth: 0, aliasDuplicateObjects: false })}` };
}
