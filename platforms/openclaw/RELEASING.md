# Releasing

The plugin is published to ClawHub as [`@zenrows/openclaw-zenrows`](https://clawhub.ai/zenrows/plugins/openclaw-zenrows), under the `zenrows` publisher. Publishing is manual: this repo has no release workflow yet.

> **Source of truth:** the plugin is built in [zenrows-integrations](https://github.com/ZenRows/zenrows-integrations) from `platforms/openclaw/` into `dist/openclaw/`. ClawHub publishes from a GitHub repo at a commit, so until `openclaw-zenrows` is kept in sync from `dist/openclaw/` as a mirror, keep publishing from `openclaw-zenrows` as described below.

## Before you start

- You need publisher access to `zenrows` on ClawHub. Ask in #proj-integrations if `clawhub package publish ... --owner zenrows` refuses you.
- Install the `clawhub` CLI (these steps were last run with v0.23.3) and log in with `clawhub login`.

## 1. Bump the version in the release PR

ClawHub takes the version from `package.json`, not from `CHANGELOG.md`. The PR that ships the change bumps all three to the same version:

- `package.json`
- `openclaw.plugin.json`
- `.claude-plugin/plugin.json`

and adds one line under a `## X.Y.Z` heading in `CHANGELOG.md` saying what changed for the user. Never leave it under `## Unreleased`.

## 2. Dry run against the merge commit

Publish the merge commit, not `main`, so what you check is what ships.

```bash
clawhub whoami
SHA=$(gh pr view <PR number> -R ZenRows/openclaw-zenrows --json mergeCommit -q .mergeCommit.oid)

clawhub package publish "ZenRows/openclaw-zenrows@$SHA" \
  --family bundle-plugin \
  --owner zenrows \
  --dry-run
```

Check that `Version` is the new one, `Name` is `@zenrows/openclaw-zenrows` and `Commit` is `$SHA`.

## 3. Publish

```bash
clawhub package publish "ZenRows/openclaw-zenrows@$SHA" \
  --family bundle-plugin \
  --owner zenrows \
  --changelog '<the CHANGELOG.md line for this version>' \
  --wait
```

- Put the changelog in single quotes. In double quotes the shell runs anything between backticks, and the text loses those words.
- `--wait` returns only after ClawHub's security scan. Without it, a release the scan holds back looks published but isn't installable.
- If the CLI asks for `--manual-override-reason`, a trusted publisher is configured for this package. Stop and ask in #proj-integrations instead of overriding it.

## 4. Prove it is live and is what was merged

```bash
curl -s https://clawhub.ai/api/v1/packages/@zenrows/openclaw-zenrows \
  | jq '.package | {latestVersion, scanStatus, sourceCommit: .verification.sourceCommit}'
```

`latestVersion` must be the new version, `scanStatus` `clean` and `sourceCommit` `$SHA`.

Then compare the published files with the merged files. This needs no local clone:

```bash
VERSION=<the new version>
cd "$(mktemp -d)"
curl -sSL -o pkg.zip "https://clawhub.ai/api/v1/packages/@zenrows/openclaw-zenrows/download?version=$VERSION"
mkdir pub repo && unzip -q pkg.zip -d pub
gh api "repos/ZenRows/openclaw-zenrows/tarball/$SHA" | tar -xz -C repo --strip-components=1
diff -r $(sed -e 's:/$::' -e '/^$/d' -e 's/^/-x /' repo/.clawhubignore) repo pub/package && echo identical
```

The `-x` flags skip what `.clawhubignore` keeps out of the package (this file among them), so only shipped files are compared. Anything other than `identical` means the release is not what was merged. Then post the version in #proj-integrations so the Integrations brain picks it up.
