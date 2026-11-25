#!/usr/bin/env bash
# The gates of mastra's CI (.github/workflows/lint.yml and lint-docs.yml) that a
# pull request adding @mastra/zenrows has to pass. check.sh runs this inside the
# Node image, in the mastra checkout at /work, once dist/mastra/ is copied over it.
#
# Env (from check.sh): BASE_SHA, the commit the pull request is based on;
# GATES, a comma list to run only those; DOCS_BUILD=1, also the Docusaurus build;
# LIVE=1, the live test.
set -uo pipefail
cd /work

results=()
failed=0
package=integrations/zenrows
changeset=.changeset/zenrows-tools.md
git_as=(-c user.name=check -c user.email=check@localhost)

# install, commit and build are what every other gate stands on, so they always run.
wanted() {
  case $1 in install | commit | build) return 0 ;; esac
  [ -z "${GATES:-}" ] || [[ ",$GATES," == *",$1,"* ]]
}

# gate <name> <function>: runs it with errexit in a subshell, so one failing
# command fails the gate and the next gate still runs. The status is left in
# $last rather than returned: errexit is off in any command whose status is
# tested, subshells included.
gate() {
  local name=$1
  last=0
  if ! wanted "$name"; then
    results+=("skip  $name")
    return
  fi
  echo
  echo "::: gate $name"
  (set -e; "$2")
  last=$?
  if [ "$last" -eq 0 ]; then
    results+=("pass  $name")
  else
    results+=("FAIL  $name")
    failed=1
  fi
}

summary() {
  echo
  echo "::: summary"
  printf '%s\n' "${results[@]}"
  [ "$failed" -eq 0 ] && echo "every gate run passed" || echo "a gate failed: see '::: gate <name>' above"
}

needed() {
  [ "$last" -eq 0 ] && return
  echo "the gates after it need it" >&2
  summary
  exit 1
}

corepack enable
pnpm config set store-dir /pnpm-store >/dev/null
git config --global --add safe.directory /work

install() {
  pnpm install --filter @mastra/zenrows... --filter mastra-turbo --filter mastra-docs... \
    --no-frozen-lockfile --reporter=append-only
}

# The pull request carries pnpm-lock.yaml with the new importer, and their CI
# installs with --frozen-lockfile, which fails on a lockfile that is out of date.
lockfile() {
  grep -q "^  $package:\$" pnpm-lock.yaml || { echo "pnpm-lock.yaml has no $package importer" >&2; return 1; }
  echo "pnpm-lock.yaml against $BASE_SHA: $(git diff --shortstat "$BASE_SHA" -- pnpm-lock.yaml)"
  pnpm install --frozen-lockfile --lockfile-only --reporter=append-only
}

# The pull request as one commit on BASE_SHA, so the diff-based gates
# (changeset status --since, the npm check, clean worktree) see what it changes.
commit() {
  git add -A
  git "${git_as[@]}" commit -q --no-verify -m 'feat(zenrows): add @mastra/zenrows'
  git diff --stat "$BASE_SHA" HEAD
}

# Their lint:format, on what the pull request changes outside docs/ (docs-check
# formats the docs). Its ignorePatterns skip integrations/ and .changeset/, so
# that passes on anything there; the same files are then checked against the
# same config without those two patterns, which is what a maintainer's oxfmt
# run on the package would rewrite. Their other patterns still apply, such as
# **/generated/** (src/generated/ is ours). oxfmt reads ignorePatterns relative
# to the config file, so that config sits next to theirs, and goes right after,
# before the clean-worktree gate.
format() {
  mapfile -t files < <(git diff --name-only --diff-filter=ACMR "$BASE_SHA" HEAD |
    grep -vE '^(docs|examples|explorations)/|^pnpm-lock\.yaml$')
  [ "${#files[@]}" -gt 0 ] || { echo "no changed files outside docs/"; return 0; }
  pnpm exec oxfmt --check --no-error-on-unmatched-pattern "${files[@]}"
  local config=/work/.oxfmtrc.package.json
  node -e '
    const config = require("/work/.oxfmtrc.json");
    delete config.$schema;
    config.ignorePatterns = config.ignorePatterns.filter(p => p !== "**/integrations/**" && p !== ".changeset/");
    process.stdout.write(JSON.stringify(config));
  ' >"$config"
  local status=0
  pnpm exec oxfmt --check --no-error-on-unmatched-pattern -c "$config" "${files[@]}" || status=$?
  rm -f "$config"
  return "$status"
}

build() { pnpm turbo build --filter @mastra/zenrows --output-logs=errors-only; }
typecheck() { pnpm --filter @mastra/zenrows exec tsc --noEmit -p tsconfig.json; }
lint() { pnpm --filter @mastra/zenrows lint; }

unit_test() {
  if [ -n "${LIVE:-}" ]; then
    pnpm --filter @mastra/zenrows exec vitest run --reporter verbose
  else
    pnpm --filter @mastra/zenrows test
  fi
}

clean_worktree() { bash .github/scripts/check-clean-worktree.bash; }
package_json() { node .github/scripts/validate-pkg-json.mjs; }

changesets() {
  node .github/scripts/check-changeset-packages.mjs
  pnpm changeset-cli status --since "$BASE_SHA"
  pnpm changeset-cli status --since "$BASE_SHA" --verbose | sed -n '/@mastra\/zenrows/p'
}

readmes() { node .github/scripts/check-package-readmes.mjs; }
agents_md() { node .github/scripts/validate-agents-md.mjs; }

# Their job bumps every version, validates peer ranges against the bumped core,
# and fails if that changed anything. It rewrites the tree, so put it back after.
peer_deps() {
  trap "git reset -q --hard $(git rev-parse HEAD); git clean -fdq" EXIT
  pnpm changeset-cli pre exit
  pnpm changeset-cli version
  git "${git_as[@]}" commit -qam 'Bump versions' || true
  node ./scripts/validate-peerdeps.mjs
  pnpm check:core-imports
  if ! git diff --quiet --ignore-space-at-eol -- ':!package.json' ||
    ! git diff --cached --quiet --ignore-space-at-eol -- ':!package.json'; then
    echo "peer dependency mismatch in:" >&2
    git diff --name-only -- ':!package.json' >&2
    return 1
  fi
}

# Their bundle test walks every workspace package; one that is not built has no
# files to check, so building core and this package covers this package's rows.
# mastracode-version.test.ts reads the Mastra Code CLI, which only their full
# build makes, and the tests that walk every package's sources outlast vitest's
# default 5 s here.
bundle() {
  cd e2e-tests/pkg-outputs
  pnpm install --reporter=append-only
  pnpm test bundle.test.ts --testTimeout 120000
}

docs_check() { cd docs && pnpm check --no-vale; }
docs_validate() { cd docs && pnpm validate; }

redirects() {
  (cd docs && pnpm generate-vercel-redirects && git diff --exit-code -- vercel.json vercel.redirects.json)
  node .github/scripts/validate-redirects.js
  BASE_REF="$BASE_SHA" node .github/scripts/check-deleted-pages.js
}

vale_version=3.27.0

# As lint-docs.yml runs it: their .vale.ini without the Packages line (the
# styles are committed), on the changed MDX, failing on errors only. Warnings
# and suggestions are printed after, for the report.
vale() {
  local bin=/tools/vale-$vale_version
  if [ ! -x "$bin" ]; then
    local arch
    case "$(uname -m)" in x86_64) arch=64-bit ;; aarch64) arch=arm64 ;; *) echo "no vale build for $(uname -m)" >&2; return 1 ;; esac
    curl -fsSL "https://github.com/errata-ai/vale/releases/download/v$vale_version/vale_${vale_version}_Linux_$arch.tar.gz" |
      tar -xz -C /tmp vale
    mv /tmp/vale "$bin"
  fi
  sed -e '/^Packages =/d' -e 's#^StylesPath = styles#StylesPath = /work/docs/styles#' docs/.vale.ini >/tmp/vale-ci.ini
  mapfile -t files < <(git diff --name-only --diff-filter=ACMRT "$BASE_SHA...HEAD" -- \
    docs/src/content/en/docs docs/src/content/en/integrations docs/src/content/en/reference docs/src/mastra-code | grep '\.mdx$')
  [ "${#files[@]}" -gt 0 ] || { echo "no changed MDX"; return 0; }
  "$bin" --config=/tmp/vale-ci.ini --minAlertLevel=error --output=line "${files[@]}"
  echo "warnings and suggestions (not gating):"
  "$bin" --config=/tmp/vale-ci.ini --minAlertLevel=suggestion --output=line "${files[@]}" || true
}

docs_build() { cd docs && pnpm build; }

gate install install; needed
gate lockfile lockfile
gate commit commit; needed
gate format format
gate build build; needed
gate typecheck typecheck
gate lint lint
gate test unit_test
gate clean-worktree clean_worktree
gate package-json package_json
gate changesets changesets
gate readmes readmes
gate agents-md agents_md
gate peer-deps peer_deps
gate bundle bundle
gate docs-check docs_check
gate docs-validate docs_validate
gate redirects redirects
gate vale vale
if [ -n "${DOCS_BUILD:-}" ]; then
  gate docs-build docs_build
else
  results+=("skip  docs-build (DOCS_BUILD=1 runs it)")
fi

# A brand-new package fails this until Mastra publishes a placeholder for it,
# which only their maintainers can do, so it is reported and never fails the run.
if wanted npm-exists; then
  echo
  echo "::: report npm-exists"
  if node .github/scripts/check-npm-packages-exist.mjs --since "$BASE_SHA"; then
    results+=("pass  npm-exists")
  else
    results+=("note  npm-exists (report only: a Mastra maintainer publishes the @mastra/zenrows placeholder; see platforms/mastra/README.md)")
  fi
fi

summary
exit "$failed"
