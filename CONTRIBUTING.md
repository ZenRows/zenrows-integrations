# Contributing

Each host's plugin in `dist/<host>/` is rendered from shared skills plus that host's own files. Edit the sources, never `dist/`.

## Layout

```
skills/<skill>/SKILL.md      shared skills; {{var}} and {{> slot}} mark what differs per host
shared/assets/               files every host ships as they are (logo)
platforms/<host>/
  vars.yaml                  values for {{var}}
  skills/<skill>/<slot>.md   the host's text for a {{> slot}} in that skill
  overrides.lock             whole-file overrides and the shared version each was copied from (only once one exists)
  everything else            the host's manifests, README, …, copied into dist/<host>/ ({{version}} comes from release-please)
dist/<host>/                 GENERATED: the plugin the host installs
.github/plugin/marketplace.json  Copilot's marketplace catalog (see below)
scripts/                     render, validate, override, new-host
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

Unknown variables, unknown skill names, missing slots and unused slot files fail the render, and `npm run validate` fails on a reference to a skill the host doesn't ship, and on a skill name written plainly instead of as `{{skill:…}}`.

## Manifest schemas

A JSON file that declares a `"$schema"` (for example Copilot's `plugin.json` and `mcp.json`) is checked against it by `npm run validate`. The schema is downloaded from that URL and cached in `.cache/schemas/` (git-ignored), so it's downloaded once per machine; CI keeps the same cache between runs. Schema URLs carry a version (`…/1.0.0/plugin.schema.json`), so the cache doesn't go stale. If the download fails, `npm run validate` fails and names the URL.

## Adding a host

Run `npm run new-host` and answer the questions:

- the host id (`platforms/<id>/`, `dist/<id>/`, tags `<id>-v1.2.3`);
- the names the skills use for the host, and what it calls Zenrows once connected ("Zenrows MCP server", "Zenrows connector");
- where the agent can write files, and any skill folder prefix;
- the plugin layout: Claude-style (`.claude-plugin/plugin.json` + `.mcp.json`), Cursor-style (`.cursor-plugin/plugin.json` + `mcp.json`), the Agent Plugins standard (`plugin.json` + `mcp.json`, as Copilot and OpenAI use), or your own paths;
- the marketplace catalog at the top of the repo the host installs from, if it installs from a subfolder of this repo (empty for hosts that use a mirror, a ZIP upload or a registry);
- a one-line description.

It creates `platforms/<id>/` (manifest, MCP config, README, the `getting-started` connect slot, `vars.yaml`), the catalog at the top of the repo if any, and adds the host to `release-please-config.json` and `.release-please-manifest.json` at `0.1.0`. Answers can also be piped in, one per line.

The text only you can write, such as install and sign-in steps, is marked `TODO(new-host)`, and `npm run validate` fails until it's filled in. Add anything else the host needs (more manifest fields, rules, commands) to `platforms/<id>/`, then run `npm run render` and commit `platforms/<id>/`, `dist/<id>/`, the catalog and `README.md` together. The render adds the host to the "Supported hosts" list in `README.md`, so don't add it by hand.

## Commits and releases

Commit messages and PR titles follow Conventional Commits. `fix`, `feat` and `perf` need a scope, for example `fix(crawl): …`. The commit-hygiene check rejects trailers, issue tracker keys and AI attribution.

Each host is its own release-please package (`dist/<host>`), with its own version and tag (`copilot-v0.1.2`). A merge that changes `dist/<host>/` opens or updates that host's release PR; merging the release PR tags it and creates the GitHub release.
