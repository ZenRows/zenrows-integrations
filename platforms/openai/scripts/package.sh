#!/usr/bin/env bash
# Builds the ZIP to upload in the OpenAI plugin submission portal from dist/openai.
# The archive holds only the plugin itself, at its root: plugin.json, mcp.json, skills/ and assets/.
set -euo pipefail

cd "$(dirname "$0")/../../.."
node platforms/openai/scripts/validate.mjs dist/openai

version=$(node -p 'require("./dist/openai/plugin.json").version')
out="$PWD/.cache/packages/openai-zenrows-${version}.zip"

rm -f "$out"
mkdir -p "$(dirname "$out")"
(cd dist/openai && zip -q -r -X "$out" plugin.json mcp.json skills assets -x '*.DS_Store')
echo "Built ${out#"$PWD"/}"
