#!/usr/bin/env bash
# Runs the gates of mastra's CI on the rendered package (dist/mastra/) inside a
# mastra checkout, because it compiles against their workspace (@mastra/core,
# their tsconfig and lint presets) and ships in their tree. gates.sh, next to
# this script, holds the gates; this script prepares the checkout and runs
# gates.sh in their Node image.
#
#   bash platforms/mastra/scripts/check.sh          fetches mastra at vars.yaml's upstream into .cache/mastra
#   bash platforms/mastra/scripts/check.sh <dir>    uses an existing checkout instead (a fork on a branch:
#                                                   it ends with one commit on that branch, the upstream
#                                                   pull request; a re-run replaces that commit)
#
# Env:
#   GATES=a,b     run only those gates, by the names the summary prints
#   DOCS_BUILD=1  also build the docs site (Docusaurus), which is slow
#   LIVE=1        also run the live test against the API. Needs ZENROWS_API_KEY;
#                 ZENROWS_API_URL (optional) points it at another deployment. Both
#                 are forwarded by name, so the key never reaches a command line.
#                 The container shares the host's network so a local stack answers.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
(cd "$repo" && node scripts/render.mjs --check >/dev/null)
vars="$repo/platforms/mastra/vars.yaml"
sha="$(sed -n 's/^upstream: *"\{0,1\}\([0-9a-f]\{40\}\)"\{0,1\} *$/\1/p' "$vars")"
[ -n "$sha" ] || { echo "$vars has no upstream: <40-character sha>" >&2; exit 1; }
node_image="node:$(sed -n 's/^node: *"\{0,1\}\([0-9A-Za-z.-]*\)"\{0,1\} *$/\1/p' "$vars")"
[ "$node_image" != "node:" ] || { echo "$vars has no node: <image tag>" >&2; exit 1; }
mastra="${1:-$repo/.cache/mastra}"

# gates.sh commits the pull request with this subject.
subject='feat(zenrows): add @mastra/zenrows'
if [ -z "${1:-}" ]; then
  # Full history, as their CI checks out (fetch-depth 0, blob:none): in a
  # shallow clone `changeset version` keeps trying to deepen it and never ends.
  if ! git -C "$mastra" cat-file -e "$sha^{commit}" 2>/dev/null; then
    rm -rf "$mastra"
    git init -q "$mastra"
    git -C "$mastra" fetch -q --filter=blob:none https://github.com/mastra-ai/mastra.git "$sha"
  elif [ "$(git -C "$mastra" rev-parse --is-shallow-repository)" = true ]; then
    git -C "$mastra" fetch -q --unshallow --filter=blob:none https://github.com/mastra-ai/mastra.git "$sha"
  fi
  # pnpm resolves the whole workspace even for a filtered install, so every
  # workspace package has to be there, and the docs gates read all of docs/.
  # The examples are not workspace packages, and are most of the tree.
  git -C "$mastra" sparse-checkout set --no-cone '/*' '!/examples/'
  git -C "$mastra" reset -q --hard "$sha"
  git -C "$mastra" clean -fdq
else
  if [ "$(git -C "$mastra" log -1 --format=%s)" = "$subject" ]; then
    git -C "$mastra" reset -q HEAD~1
  fi
  git -C "$mastra" merge-base --is-ancestor "$sha" HEAD ||
    echo "note: $mastra does not contain ${sha:0:10}, the commit vars.yaml pins" >&2
fi
base="$(git -C "$mastra" rev-parse HEAD)"

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
          label: \x27Zenrows\x27,
          customProps: { icon: \x27/img/integrations/zenrows.svg\x27 },
        },`;
fs.writeFileSync(file, source.slice(0, at) + entry + source.slice(at));
' "$mastra/docs/src/content/en/integrations/sidebars.js"

network=()
if [ -n "${LIVE:-}" ]; then
  [ -n "${ZENROWS_API_KEY:-}" ] || { echo "LIVE=1 needs ZENROWS_API_KEY in the environment" >&2; exit 1; }
  network=(--network host -e ZENROWS_API_KEY ${ZENROWS_API_URL:+-e ZENROWS_API_URL})
fi

# Their toolchain: Node from the pinned image, pnpm from their packageManager
# field through corepack. The store and the Vale binary live in volumes so a
# second run is fast.
docker run --rm -v "$mastra:/work" -w /work -v mastra-pnpm-store:/pnpm-store -v mastra-tools:/tools \
  -v "$repo/platforms/mastra/scripts/gates.sh:/gates.sh:ro" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e CI=1 -e BASE_SHA="$base" -e GATES -e DOCS_BUILD -e LIVE \
  ${network[@]+"${network[@]}"} "$node_image" bash /gates.sh
