#!/usr/bin/env bash
# Builds, type-checks, lints and tests the rendered package (dist/mastra/)
# inside a mastra checkout, because it compiles against their workspace
# (@mastra/core, their tsconfig and lint presets) and ships in their tree.
#
#   bash platforms/mastra/scripts/check.sh          fetches mastra at vars.yaml's upstream into .cache/mastra
#   bash platforms/mastra/scripts/check.sh <dir>    uses an existing checkout instead (a fork on a branch:
#                                                   what is left in git status is the upstream pull request)
#
# Env:
#   LIVE=1   also run the live test against the API. Needs ZENROWS_API_KEY;
#            ZENROWS_API_URL (optional) points it at another deployment. Both
#            are forwarded by name, so the key never reaches a command line.
#            The container shares the host's network so a local stack answers.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
(cd "$repo" && node scripts/render.mjs --check >/dev/null)
vars="$repo/platforms/mastra/vars.yaml"
sha="$(sed -n 's/^upstream: *"\{0,1\}\([0-9a-f]\{40\}\)"\{0,1\} *$/\1/p' "$vars")"
[ -n "$sha" ] || { echo "$vars has no upstream: <40-character sha>" >&2; exit 1; }
node_image="node:$(sed -n 's/^node: *"\{0,1\}\([0-9A-Za-z.-]*\)"\{0,1\} *$/\1/p' "$vars")"
[ "$node_image" != "node:" ] || { echo "$vars has no node: <image tag>" >&2; exit 1; }
mastra="${1:-$repo/.cache/mastra}"

if [ -z "${1:-}" ]; then
  if [ "$(git -C "$mastra" rev-parse HEAD 2>/dev/null)" != "$sha" ]; then
    rm -rf "$mastra"
    git init -q "$mastra"
    git -C "$mastra" fetch -q --depth 1 --filter=blob:none https://github.com/mastra-ai/mastra.git "$sha"
  fi
  # pnpm resolves the whole workspace even for a filtered install, so every
  # workspace package has to be there. The examples and most of the docs are
  # not workspace packages, and are most of the tree.
  git -C "$mastra" sparse-checkout set --no-cone '/*' '!/examples/' '!/docs/' /docs/package.json \
    /docs/src/content/en/integrations/ /docs/static/img/integrations/
  git -C "$mastra" checkout -q --force "$sha"
elif [ "$(git -C "$mastra" rev-parse HEAD)" != "$sha" ]; then
  echo "note: $mastra is at $(git -C "$mastra" rev-parse --short HEAD), vars.yaml pins ${sha:0:10}" >&2
fi

package="$mastra/integrations/zenrows"
rm -rf "$package"
cp -R "$repo/dist/mastra/." "$mastra/"

# The sidebar entry, after Tavily: the tools are listed alphabetically. Idempotent,
# so re-running against a checkout you keep is safe.
node -e '
const fs = require("node:fs");
const file = process.argv[1];
const source = fs.readFileSync(file, "utf8");
if (source.includes("id: \x27tools/zenrows\x27")) process.exit(0);
const anchor = source.indexOf("id: \x27tools/tavily\x27");
if (anchor < 0) throw new Error(`${file}: no tools/tavily entry to add tools/zenrows after`);
const close = source.indexOf("\n        },\n", anchor);
if (close < 0) throw new Error(`${file}: the tools/tavily entry is not closed where expected`);
const at = close + "\n        },".length;
const entry = `
        {
          type: \x27doc\x27,
          id: \x27tools/zenrows\x27,
          label: \x27ZenRows\x27,
          customProps: { icon: \x27/img/integrations/zenrows.svg\x27 },
        },`;
fs.writeFileSync(file, source.slice(0, at) + entry + source.slice(at));
' "$mastra/docs/src/content/en/integrations/sidebars.js"

network=()
test_cmd="pnpm --filter @mastra/zenrows test"
if [ -n "${LIVE:-}" ]; then
  [ -n "${ZENROWS_API_KEY:-}" ] || { echo "LIVE=1 needs ZENROWS_API_KEY in the environment" >&2; exit 1; }
  network=(--network host -e ZENROWS_API_KEY ${ZENROWS_API_URL:+-e ZENROWS_API_URL})
  test_cmd="pnpm --filter @mastra/zenrows exec vitest run --reporter verbose"
fi

# Their toolchain: Node from the pinned image, pnpm from their packageManager
# field through corepack. The store lives in a volume so a second run is fast.
docker run --rm -v "$mastra:/work" -w /work -v mastra-pnpm-store:/pnpm-store \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e CI=1 "${network[@]}" "$node_image" sh -euc "
    corepack enable
    pnpm config set store-dir /pnpm-store >/dev/null
    pnpm install --filter @mastra/zenrows... --filter mastra-turbo --no-frozen-lockfile --reporter=append-only
    pnpm turbo build --filter @mastra/zenrows --output-logs=errors-only
    pnpm --filter @mastra/zenrows exec tsc --noEmit -p tsconfig.json
    pnpm --filter @mastra/zenrows lint
    $test_cmd
  "
