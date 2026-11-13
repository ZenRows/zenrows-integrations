#!/usr/bin/env bash
# Lints, builds and tests the rendered piece (dist/activepieces/) inside an
# activepieces checkout, the way their CI does, because the piece depends on
# their workspace packages.
#
#   platforms/activepieces/scripts/check.sh         clones activepieces at vars.yaml's upstream into .cache/activepieces
#   platforms/activepieces/scripts/check.sh <dir>   uses an existing checkout instead (faster locally)
#
# dist/activepieces/ is copied to <dir>/packages/pieces/community/zenrows, so a
# checkout you pass in gets this repo's version of the piece. Run npm run render
# first; this checks the committed render is current.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
(cd "$repo" && node scripts/render.mjs --check >/dev/null)
sha="$(sed -n 's/^upstream: *"\{0,1\}\([0-9a-f]\{40\}\)"\{0,1\} *$/\1/p' "$repo/platforms/activepieces/vars.yaml")"
[ -n "$sha" ] || { echo "platforms/activepieces/vars.yaml has no upstream: <40-character sha>" >&2; exit 1; }
ap="${1:-$repo/.cache/activepieces}"

if [ -z "${1:-}" ]; then
  if [ "$(git -C "$ap" rev-parse HEAD 2>/dev/null)" != "$sha" ]; then
    rm -rf "$ap"
    git init -q "$ap"
    git -C "$ap" fetch -q --depth 1 https://github.com/activepieces/activepieces.git "$sha"
    git -C "$ap" checkout -q FETCH_HEAD
  fi
elif [ "$(git -C "$ap" rev-parse HEAD)" != "$sha" ]; then
  echo "note: $ap is at $(git -C "$ap" rev-parse --short HEAD), vars.yaml pins ${sha:0:10}" >&2
fi

piece="$ap/packages/pieces/community/zenrows"
rm -rf "$piece"
mkdir -p "$piece"
cp -R "$repo/dist/activepieces/." "$piece"

# Register the piece's path, as a new piece in their repo does.
node -e '
const fs = require("fs");
const file = process.argv[1];
const config = JSON.parse(fs.readFileSync(file, "utf8"));
const paths = config.compilerOptions.paths;
if (!paths["@activepieces/piece-zenrows"]) {
  paths["@activepieces/piece-zenrows"] = ["packages/pieces/community/zenrows/src/index.ts"];
  config.compilerOptions.paths = Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
}' "$ap/tsconfig.base.json"

# Their pinned bun. Turbo looks for it on PATH, so when the installed bun is
# missing or another version, install theirs into .cache/ and put it first.
bun_version="$(node -p 'require(process.argv[1]).packageManager.split("@")[1]' "$ap/package.json")"
if ! command -v bun >/dev/null || [ "$(bun --version)" != "$bun_version" ]; then
  prefix="$repo/.cache/bun-$bun_version"
  [ -x "$prefix/node_modules/.bin/bun" ] || npm install -s --prefix "$prefix" "bun@$bun_version"
  export PATH="$prefix/node_modules/.bin:$PATH"
fi

cd "$ap"
# Not --frozen-lockfile: the new piece adds a workspace entry to bun.lock.
bun install
npx turbo run lint build test --filter=@activepieces/piece-zenrows
