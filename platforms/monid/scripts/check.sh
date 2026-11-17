#!/usr/bin/env bash
# Type-checks and tests the rendered connector (dist/monid/) inside a monid
# checkout, the way their CI does, because the connector compiles and runs
# against their workspace packages.
#
#   bash platforms/monid/scripts/check.sh          clones monid at vars.yaml's upstream into .cache/monid
#   bash platforms/monid/scripts/check.sh <dir>    uses an existing checkout instead (faster locally)
#
# Env:
#   SCOPE=connectors/zenrows/   test only this path (the fast loop; the whole
#                               suite takes about 20 minutes)
#   FMT=1                       also run `deno fmt --check` and `deno lint` on
#                               the connector. Their CI runs neither, but their
#                               review config says deno fmt governs formatting.
#   LIVE=1                      run the live tests too, against the real API.
#                               Needs ZENROWS_API_KEY in the environment; it is
#                               forwarded by name, so the value never reaches a
#                               command line. Without it the live tests are
#                               `ignored` and nothing calls the vendor.
#
# dist/monid/connectors/zenrows is copied to <dir>/connectors/zenrows, so a
# checkout you pass in gets this repo's version of the connector. Run
# npm run render first; this checks the committed render is current.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
(cd "$repo" && node scripts/render.mjs --check >/dev/null)
vars="$repo/platforms/monid/vars.yaml"
sha="$(sed -n 's/^upstream: *"\{0,1\}\([0-9a-f]\{40\}\)"\{0,1\} *$/\1/p' "$vars")"
[ -n "$sha" ] || { echo "$vars has no upstream: <40-character sha>" >&2; exit 1; }
deno_version="$(sed -n 's/^deno: *"\{0,1\}\([0-9][0-9.]*\)"\{0,1\} *$/\1/p' "$vars")"
[ -n "$deno_version" ] || { echo "$vars has no deno: <version>" >&2; exit 1; }
monid="${1:-$repo/.cache/monid}"

if [ -z "${1:-}" ]; then
  if [ "$(git -C "$monid" rev-parse HEAD 2>/dev/null)" != "$sha" ]; then
    rm -rf "$monid"
    git init -q "$monid"
    git -C "$monid" fetch -q --depth 1 https://github.com/monid-ai/monid.git "$sha"
    git -C "$monid" checkout -q FETCH_HEAD
  fi
elif [ "$(git -C "$monid" rev-parse HEAD)" != "$sha" ]; then
  echo "note: $monid is at $(git -C "$monid" rev-parse --short HEAD), vars.yaml pins ${sha:0:10}" >&2
fi

connector="$monid/connectors/zenrows"
rm -rf "$connector"
mkdir -p "$connector"
cp -R "$repo/dist/monid/connectors/zenrows/." "$connector"

# The two edits monid's repo needs to carry this connector. Both are
# idempotent, so re-running against a checkout you keep is safe.
#
#  1. shared/testing/fixtures.ts — a fixture may only carry response headers
#     on the recorder's allowlist, and a Zenrows fixture carries the meter
#     this connector bills from. Growing that list is a deliberate edit in
#     the same PR as the connector that needs it (their comment says so).
#  2. connectors/ids.lock.json — doc ids are their public API, guarded by a
#     committed lock. A new connector adds its ids in the same commit.
node -e '
const fs = require("node:fs");
const [fixtures, lock] = process.argv.slice(1);

const header = "x-request-credits";
const source = fs.readFileSync(fixtures, "utf8");
if (!source.includes(`"${header}"`)) {
  const anchor = "export const RECORDED_RES_HEADERS = [";
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`${fixtures}: no RECORDED_RES_HEADERS to extend`);
  const close = source.indexOf("]", at);
  if (close < 0) throw new Error(`${fixtures}: RECORDED_RES_HEADERS is not closed`);
  fs.writeFileSync(fixtures, `${source.slice(0, close)}    "${header}",\n${source.slice(close)}`);
}

const ids = JSON.parse(fs.readFileSync(lock, "utf8"));
const before = ids.endpoints.length;
ids.endpoints = [...new Set([...ids.endpoints, "zenrows#scrape", "zenrows#extract"])].sort();
if (ids.endpoints.length !== before) fs.writeFileSync(lock, `${JSON.stringify(ids, null, 4)}\n`);
' "$monid/shared/testing/fixtures.ts" "$monid/connectors/ids.lock.json"

# Their Deno, from PATH when it is the pinned one (CI installs it), from the
# pinned image otherwise — this host may have no deno.
run() {
  if command -v deno >/dev/null && [ "$(deno --version | head -1 | cut -d' ' -f2)" = "$deno_version" ]; then
    (cd "$monid" && sh -c "$1")
  else
    docker run --rm -v "$monid:/work" -w /work -v monid-deno:/deno-dir \
      -e DENO_DIR=/deno-dir ${ZENROWS_API_KEY:+-e ZENROWS_API_KEY} \
      "denoland/deno:$deno_version" sh -c "$1"
  fi
}

scope="${SCOPE:-}"
run "deno task check"
if [ -n "${LIVE:-}" ]; then
  # test:live is their task that adds --allow-net. The gate inside each live
  # test still skips unless the credential resolves, so a wrong variable name
  # shows up as "ignored" rather than as a pass.
  [ -n "${ZENROWS_API_KEY:-}" ] || {
    echo "LIVE=1 needs ZENROWS_API_KEY in the environment" >&2; exit 1; }
  run "deno task test:live ${scope}"
else
  run "deno task test ${scope}"
fi
if [ -n "${FMT:-}" ]; then
  run "deno fmt --check connectors/zenrows/ && deno lint connectors/zenrows/"
fi
