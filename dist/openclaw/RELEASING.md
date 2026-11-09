# Releasing

The plugin is published to ClawHub as [`@zenrows/openclaw-zenrows`](https://clawhub.ai/zenrows/plugins/openclaw-zenrows), under the `zenrows` publisher. Publishing to ClawHub is manual.

> **Source of truth:** the plugin is built in [zenrows-integrations](https://github.com/ZenRows/zenrows-integrations) from `platforms/openclaw/` into `dist/openclaw/`. ClawHub publishes from a GitHub repo at a commit, so each release of `openclaw` there is pushed to `openclaw-zenrows` as a mirror and tagged `v<version>`. Never change `openclaw-zenrows` by hand; ClawHub publishes that tag's commit.

## Before you start

- You need publisher access to `zenrows` on ClawHub. Ask in #proj-integrations if `clawhub package publish ... --owner zenrows` refuses you.
- Install the `clawhub` CLI (these steps were last run with v0.23.3) and log in with `clawhub login`.

## 1. Release in zenrows-integrations

Merge the `openclaw` release PR in zenrows-integrations. release-please bumps the version in `package.json`, `openclaw.plugin.json` and `.claude-plugin/plugin.json` (ClawHub takes it from `package.json`), and the release workflow pushes `dist/openclaw/` to `openclaw-zenrows` and tags it `v<version>`. Check that the tag is there before going on.

## 2. Dry run against the release commit

Publish the mirror's commit for the tag, not `main`, so what you check is what ships.

```bash
clawhub whoami
VERSION=<the new version>
SHA=$(gh api "repos/ZenRows/openclaw-zenrows/commits/v$VERSION" --jq .sha)

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
  --changelog '<what changed for the user, from the openclaw-v<version> release notes>' \
  --wait
```

- Put the changelog in single quotes. In double quotes the shell runs anything between backticks, and the text loses those words.
- `--wait` returns only after ClawHub's security scan. Without it, a release the scan holds back looks published but isn't installable.
- If the CLI asks for `--manual-override-reason`, a trusted publisher is configured for this package. Stop and ask in #proj-integrations instead of overriding it.

## 4. Prove it is live and is what was released

```bash
curl -s https://clawhub.ai/api/v1/packages/@zenrows/openclaw-zenrows \
  | jq '.package | {latestVersion, scanStatus, sourceCommit: .verification.sourceCommit}'
```

`latestVersion` must be the new version, `scanStatus` `clean` and `sourceCommit` `$SHA`.

Then compare the published files with the released files. This needs no local clone:

```bash
VERSION=<the new version>
cd "$(mktemp -d)"
curl -sSL -o pkg.zip "https://clawhub.ai/api/v1/packages/@zenrows/openclaw-zenrows/download?version=$VERSION"
mkdir pub repo && unzip -q pkg.zip -d pub
gh api "repos/ZenRows/openclaw-zenrows/tarball/$SHA" | tar -xz -C repo --strip-components=1
diff -r $(sed -e 's:/$::' -e '/^$/d' -e 's/^/-x /' repo/.clawhubignore) repo pub/package && echo identical
```

The `-x` flags skip what `.clawhubignore` keeps out of the package (this file among them), so only shipped files are compared. Anything other than `identical` means the published package is not what was released. Then post the version in #proj-integrations so the Integrations brain picks it up.
