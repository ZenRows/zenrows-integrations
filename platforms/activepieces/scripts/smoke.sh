#!/usr/bin/env bash
# Runs each action of the rendered piece against the live Zenrows API, with a
# fake Activepieces context (platforms/activepieces/scripts/smoke.ts), and prints
# what each returns. It asks for your API key and keeps it in this process only.
#
#   platforms/activepieces/scripts/smoke.sh         builds the piece in .cache/activepieces first (check.sh)
#   platforms/activepieces/scripts/smoke.sh <dir>   uses an existing activepieces checkout instead
#
# Each run spends a few credits. Not for CI.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
ap="${1:-$repo/.cache/activepieces}"

if [ -z "${ZENROWS_API_KEY:-}" ]; then
  # A key piped in without a final newline makes read report end-of-file.
  read -rsp "Zenrows API key (not shown): " ZENROWS_API_KEY || [ -n "$ZENROWS_API_KEY" ]
  echo
fi
# A key is letters and digits; anything else is a paste of the wrong thing.
if ! [[ "$ZENROWS_API_KEY" =~ ^[A-Za-z0-9]{20,}$ ]]; then
  echo "That isn't a Zenrows API key (expected letters and digits only, got ${#ZENROWS_API_KEY} characters). Copy it from https://app.zenrows.com and try again." >&2
  exit 1
fi
export ZENROWS_API_KEY

echo "Building the piece in $ap …"
"$here/check.sh" ${1:+"$1"} >/dev/null 2>&1 </dev/null

# check.sh put their pinned bun first on PATH only for itself; do the same here.
bun_version="$(node -p 'require(process.argv[1]).packageManager.split("@")[1]' "$ap/package.json")"
if ! command -v bun >/dev/null || [ "$(bun --version)" != "$bun_version" ]; then
  export PATH="$repo/.cache/bun-$bun_version/node_modules/.bin:$PATH"
fi

cd "$ap"
bun run "$here/smoke.ts" "$ap" 2>/dev/null | grep -E "^(✅|❌)"; exit "${PIPESTATUS[0]}"
