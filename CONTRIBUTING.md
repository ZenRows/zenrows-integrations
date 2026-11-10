# Contributing

Each host's plugin in `dist/<host>/` is rendered from shared skills plus that host's own files. Code hosts (a piece for another project, a marketplace listing) are rendered the same way from their own source and the shared text. Edit the sources, never `dist/`.

## Layout

```
skills/<skill>/SKILL.md      shared skills; {{var}} and {{> slot}} mark what differs per host
shared/assets/               files every plugin host ships as they are (logo)
shared/text/<name>.md        one fact in plain text, used by skills ({{< name}}) and code hosts ({{text:name}})
platforms/<host>/
  vars.yaml                  values for {{var}}
  skills/<skill>/<slot>.md   the host's text for a {{> slot}} in that skill
  overrides.lock             whole-file overrides and the shared version each was copied from (only once one exists)
  scripts/                   the host's own tooling, never shipped: validate.mjs (run by npm run validate on
                             dist/<host>), package.sh (run by npm run package -- <host>) and check.sh (a code
                             host's build and test, run by its CI workflow), when the host needs them
  everything else            the host's manifests, README, …, copied into dist/<host>/ ({{version}} comes from release-please)
dist/<host>/                 GENERATED: the plugin the host installs, or a code host's files
.github/plugin/marketplace.json  Copilot's marketplace catalog (see below)
scripts/                     render, validate, override, new-host, package, mirror
```

### Marketplace catalogs

Some hosts install from a subfolder of this repo through a catalog file at the top of the repo, at a path the host chooses: Copilot reads `.github/plugin/marketplace.json`, Claude would read `.claude-plugin/marketplace.json`. Each catalog points at its host's `./dist/<host>`. Catalogs are normal files, not generated: edit them directly. release-please bumps their version on each release, so each one is listed in that host's `extra-files` in `release-please-config.json` (with a leading `/`), and `npm run validate` checks that it points at `./dist/<host>` with the host's current version.

## Editing

Requires Node 22. Run `npm ci` once.

1. Change `skills/`, `shared/` or `platforms/<host>/`.
2. Run `npm run render` and commit the changes in `dist/` with your edit. If you forget, `git commit` and `git push` stop and tell you to run it (hooks in `.githooks/`, turned on by `npm ci`), and CI fails too. Never edit `dist/` by hand: the same checks catch it.
3. Run `npm run validate` (CI runs it too).

## Text that differs per host

- **A word or phrase:** use a variable, for example `{{host}}`, and set it in `platforms/<host>/vars.yaml`.
- **A paragraph or a few lines:** use a slot, for example `{{> connect}}`, and write the host's text in `platforms/<host>/skills/<skill>/connect.md`. Everything outside the slot stays shared, so later fixes still reach the host.
- **The whole file, as a last resort:** `npm run override -- <host> <skill>` copies the shared skill into `platforms/<host>/` and records which version it was copied from in `overrides.lock`. When the shared skill changes later, `npm run validate` fails until someone updates the copy, or confirms the change doesn't apply, and runs `npm run override:ack -- <host> <skill>`.
- **A skill only one host has:** put it in `platforms/<host>/skills/<name>/SKILL.md`, with no shared skill of that name. It ships only on that host and needs no `overrides.lock` entry.
- **A shared skill a host shouldn't ship:** list it under `skip_skills:` in that host's `vars.yaml` (Cursor uses a rules file instead of `using-zenrows`). A `{{skill:…}}` reference to a skipped skill fails the render.
- **A reference to another skill:** write `{{skill:batch}}`, never the plain name. It renders as that skill's name on the host: `skill_prefix` plus the shared name, unless `skill_names` in `vars.yaml` renames it (OpenClaw ships `scrape-webpage` as `zenrows-scrape`). The skill's own `name:` in its frontmatter uses it too.

Unknown variables, unknown skill names, missing slots, unused slot files and unknown snippets fail the render, and `npm run validate` fails on a reference to a skill the host doesn't ship, and on a skill name written plainly instead of as `{{skill:…}}`.

## Shared text

A fact that more than one place states (what an error code means, what a request costs) lives once in `shared/text/<name>.md`, as one line of plain text. A skill or a text file inlines it with `{{< name}}`; code uses `{{text:name}}`, which renders as a quoted string, and adds its own words around it. Snippets stay plain text so they read right in both, and `npm run validate` fails on markdown in one, or on one nothing uses.

## Code hosts

`kind: code` in `vars.yaml` makes a host whose output isn't a plugin but files for somewhere else: code for another project (a piece as it sits in that project's repo), or a listing a marketplace reads. A code host ships only its own files, with `{{…}}` filled in source files too: no shared skills, `LICENSE` or assets, and no `plugin.json`. Its `README.md` documents it here and isn't shipped. It needs no release-please entry until it's released from this repo. If it's code, its `scripts/check.sh` can build and test `dist/<host>/` the way the target project does, run by its own workflow (`platforms/activepieces/` does).

## Manifest schemas

A JSON file that declares a `"$schema"` (for example Copilot's `plugin.json` and `mcp.json`) is checked against it by `npm run validate`. The schema is downloaded from that URL and cached in `.cache/schemas/` (git-ignored), so it's downloaded once per machine; CI keeps the same cache between runs. Schema URLs carry a version (`…/1.0.0/plugin.schema.json`), so the cache doesn't go stale. If the download fails, `npm run validate` fails and names the URL.

## Adding a host

Run `npm run new-host`. It asks for the host id (`platforms/<id>/`, `dist/<id>/`, tags `<id>-v1.2.3`) and the full product name, then creates `platforms/<id>/` from templates:

- `vars.yaml`, with defaults and comments for every setting;
- a generic `plugin.json` and `mcp.json`;
- the README;
- the `getting-started` sign-in slot.

It also adds the host to `release-please-config.json` and `.release-please-manifest.json` at `0.1.0`. Answers can also be piped in, one per line.

What only a person can decide is marked `TODO(new-host)`, and `npm run validate` fails until it's done: the install and sign-in steps, where the agent can write files, and the plugin files. Each host reads its own layout (Claude: `.claude-plugin/plugin.json` and `.mcp.json`; Cursor: `.cursor-plugin/plugin.json`), so move the templates to those paths, add the fields the host needs, update the manifest path in `release-please-config.json`, and add a marketplace catalog at the top of the repo if the host installs from a subfolder. Use an existing `platforms/<host>/` as the example. Then run `npm run render` and commit `platforms/<id>/`, `dist/<id>/`, the release-please files and `README.md` together. The render adds the host to the "Supported hosts" list in `README.md`, so don't add it by hand.

## Commits and releases

Commit messages and PR titles follow Conventional Commits. `fix`, `feat` and `perf` need a scope, for example `fix(crawl): …`. The commit-hygiene check rejects trailers, issue tracker keys and AI attribution.

Each host is its own release-please package (`dist/<host>`), with its own version and tag (`copilot-v0.1.2`). A merge that changes `dist/<host>/` opens or updates that host's release PR; merging the release PR tags it and creates the GitHub release.

### Mirror repos

Some installs name a repo of their own instead of a folder here: `copilot plugin marketplace add ZenRows/copilot-zenrows` reads that repo's root. Such a repo is a mirror: `mirror: ZenRows/copilot-zenrows` in the host's `vars.yaml` makes each release of the host replace the mirror's contents with `dist/<host>/`, plus the host's marketplace catalogs at the same paths, listing only that host with `source` set to `./` (the mirror's root), and a banner in its README pointing here. So the catalog is edited in one place, and `npm run validate` fails if a mirrored host has none. Nobody edits a mirror by hand; only its deploy key can push to it.

- The release workflow runs `.github/workflows/mirror.yml` for each released host. It makes one normal commit (`release copilot-v0.1.2 from ZenRows/zenrows-integrations@<sha>`), never a force-push, and tags the mirror `v<version>`. No commit is made when nothing changed, so a re-run is safe.
- It pushes with the deploy key in the `MIRROR_KEY_<HOST>` secret of the `release` environment. The key, the mirror's branch protection and its settings are in [iac-bootstrap](https://github.com/ZenRows/iac-bootstrap).
- To see what the mirror would get: `npm run mirror -- <host> <clone of the mirror> [<release tag>]`, then `git diff` in the clone. To publish by hand (for example after fixing a failed run), run the Mirror workflow from Actions with the host and the release tag; it's a dry run unless you untick it. With no tag it publishes `main`'s `dist/<host>/`, names the commit in the README banner and tags nothing.
- Manual runs, dry runs included, start from `main`: the job uses the `release` environment, which only deploys from `main`.
