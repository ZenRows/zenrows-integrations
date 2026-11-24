#!/usr/bin/env bash
# Lints, builds and tests the rendered piece (dist/activepieces/) inside an
# activepieces checkout, the way their CI does, because the piece depends on
# their workspace packages.
#
#   platforms/activepieces/scripts/check.sh         clones activepieces at vars.yaml's upstream into .cache/activepieces
#   platforms/activepieces/scripts/check.sh <dir>   uses an existing checkout instead (faster locally)
#   platforms/activepieces/scripts/check.sh --upstream <github-login> <dir>
#                                                   prepares <dir>, a clone of your fork, for the PR to
#                                                   activepieces (scripts/upstream.mjs), then checks that copy
#
# dist/activepieces/ is copied to <dir>/packages/pieces/community/zenrows, so a
# checkout you pass in gets this repo's version of the piece. Run npm run render
# first; this checks the committed render is current.
set -euo pipefail

upstream_login=""
if [ "${1:-}" = "--upstream" ]; then
  upstream_login="${2:-}"
  [ -n "$upstream_login" ] && [ -n "${3:-}" ] || { echo "usage: check.sh --upstream <github-login> <activepieces checkout>" >&2; exit 1; }
  shift 2
fi

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
if [ -n "$upstream_login" ]; then
  node "$repo/platforms/activepieces/scripts/upstream.mjs" "$piece" "$upstream_login"
fi

# Register the piece's path, as a new piece in their repo does. Their file is
# Prettier's layout and its paths are not sorted, so the entry goes in as text
# after the greatest name below it, and no other line changes.
node -e '
const fs = require("fs");
const file = process.argv[1];
const text = fs.readFileSync(file, "utf8");
const name = "@activepieces/piece-zenrows";
const paths = JSON.parse(text).compilerOptions.paths;
if (!paths[name]) {
  const before = Object.keys(paths).filter((key) => key.localeCompare(name) < 0).sort((a, b) => a.localeCompare(b)).pop();
  const lines = text.split("\n");
  let at = lines.findIndex((line) => line.trimStart().startsWith(JSON.stringify(before) + ":"));
  if (at < 0) throw new Error(`tsconfig.base.json: cannot find ${before}`);
  while (!/\],?\s*$/.test(lines[at])) at++;
  const indent = lines[at].match(/^\s*/)[0].length > 6 ? lines[at].match(/^\s*/)[0].slice(2) : lines[at].match(/^\s*/)[0];
  lines.splice(at + 1, 0, `${indent}"${name}": [`, `${indent}  "packages/pieces/community/zenrows/src/index.ts"`, `${indent}],`);
  const out = lines.join("\n");
  JSON.parse(out);
  fs.writeFileSync(file, out);
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
if [ -n "$upstream_login" ]; then
  # bun may touch other packages' lock entries too (a checksum it adds, say);
  # a PR to activepieces carries only the piece's own, so the rest is undone.
  git diff -U0 bun.lock | node -e '
const diff = require("fs").readFileSync(0, "utf8");
const [header, ...hunks] = diff.split(/^(?=@@ )/m);
const other = hunks.filter((hunk) => !hunk.includes("piece-zenrows") && !hunk.includes("community/zenrows"));
process.stdout.write(other.length ? header + other.join("") : "");
' > "$ap/.zenrows-other.patch"
  if [ -s "$ap/.zenrows-other.patch" ]; then git apply -R --unidiff-zero "$ap/.zenrows-other.patch"; fi
  rm -f "$ap/.zenrows-other.patch"
fi
npx turbo run lint build test --filter=@activepieces/piece-zenrows
