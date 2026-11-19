# Contributing

Each host's plugin in `dist/<host>/` is rendered from shared skills plus that host's own files. Code hosts (a piece for another project, a marketplace listing) are rendered the same way from their own source and the shared text. Edit the sources, never `dist/`.

## Layout

```
skills/<skill>/SKILL.md      shared skills; {{var}} and {{> slot}} mark what differs per host
shared/README.md             every plugin's README; {{> setup}} and {{>? more}} take the host's own sections
shared/assets/               files every plugin host ships as they are (logo)
shared/text/<name>.md        one fact in plain text, used by skills ({{< name}}) and code hosts ({{text:name}})
shared/vars.yaml             values every host gets as {{name}} (contact_email); a host's vars.yaml can override one
shared/endpoints.yaml        endpoints on top of the spec: a slice of one operation (fetch, extract), or text it lacks
shared/billing.yaml          what we offer and how it's billed: per_credit, after_run, free or not_offered, for every API operation
platforms/<host>/
  vars.yaml                  values for {{var}}
  skills/<skill>/<slot>.md   the host's text for a {{> slot}} in that skill
  readme/setup.md            the host's Setup section of its README (readme/more.md: optional extra sections)
  overrides.lock             whole-file overrides and the shared version each was copied from (only once one exists)
  scripts/                   the host's own tooling, never shipped; render.mjs, validate.mjs and package.sh are
                             run by npm run render, npm run validate and npm run package -- <host>, the rest by the host itself
  everything else            the host's manifests, …, copied into dist/<host>/ ({{version}} comes from release-please)
dist/<host>/                 GENERATED: the plugin the host installs, or a code host's files (CHANGELOG.md comes from release-please)
.github/plugin/marketplace.json  Copilot's marketplace catalog (see below)
scripts/                     render, validate, override, new-host, package, mirror, test
```

### Marketplace catalogs

Some hosts install from a subfolder of this repo through a catalog file at the top of the repo, at a path the host chooses: Copilot reads `.github/plugin/marketplace.json`, Claude would read `.claude-plugin/marketplace.json`. Each catalog points at its host's `./dist/<host>`. Catalogs are normal files, not generated: edit them directly. release-please bumps their version on each release, so each one is listed in that host's `extra-files` in `release-please-config.json` (with a leading `/`), and `npm run validate` checks that it points at `./dist/<host>` with the host's current version. Inside `dist/<host>`, the render writes each JSON file listed in `extra-files` (a manifest such as `plugin.json`) as release-please rewrites it, two-space indented with one array item per line, so a release PR only changes the version; write the source in `platforms/<host>/` however you like.

## Editing

Requires Node 22. Run `npm ci` once.

1. Change `skills/`, `shared/` or `platforms/<host>/`.
2. Run `npm run render` and commit the changes in `dist/` with your edit. If you forget, `git commit` and `git push` stop and tell you to run it (hooks in `.githooks/`, turned on by `npm ci`), and CI fails too. Never edit `dist/` by hand: the same checks catch it.
3. Run `npm run validate` (CI runs it too).

## Text that differs per host

- **A word or phrase:** use a variable, for example `{{host}}`, and set it in `platforms/<host>/vars.yaml`. A value every host shares, such as `{{contact_email}}`, goes in `shared/vars.yaml` instead.
- **A paragraph or a few lines:** use a slot, for example `{{> connect}}`, and write the host's text in `platforms/<host>/skills/<skill>/connect.md`. Everything outside the slot stays shared, so later fixes still reach the host.
- **An optional paragraph:** `{{>? name}}` is a slot a host may leave out; without the file, its line goes. The README uses it for `readme/more.md`.
- **The README:** every plugin's README is `shared/README.md`. A host writes only `readme/setup.md` (how to install and sign in) and, if it needs more, `readme/more.md`; its own `README.md` fails the render. Code hosts keep their own README.
- **The whole file, as a last resort:** `npm run override -- <host> <skill>` copies the shared skill into `platforms/<host>/` and records which version it was copied from in `overrides.lock`. When the shared skill changes later, `npm run validate` fails until someone updates the copy, or confirms the change doesn't apply, and runs `npm run override:ack -- <host> <skill>`.
- **A skill only one host has:** put it in `platforms/<host>/skills/<name>/SKILL.md`, with no shared skill of that name. It ships only on that host and needs no `overrides.lock` entry.
- **A shared skill a host shouldn't ship:** list it under `skip_skills:` in that host's `vars.yaml` (Cursor uses a rules file instead of `using-zenrows`). A `{{skill:…}}` reference to a skipped skill fails the render.
- **A reference to another skill:** write `{{skill:batch}}`, never the plain name. It renders as that skill's name on the host: `skill_prefix` plus the shared name, unless `skill_names` in `vars.yaml` renames it (OpenClaw ships `scrape-webpage` as `zenrows-scrape`). The skill's own `name:` in its frontmatter uses it too.

Unknown variables, unknown skill names, missing slots, unused slot files, unknown snippets and any of these placeholders left in a rendered file (a typo, or a file type the render doesn't fill) fail the render. Other `{{…}}`, such as an n8n or Make expression or JSX's `style={{…}}`, isn't one of these placeholders and ships as written, and `npm run validate` fails on a reference to a skill the host doesn't ship, and on a skill name written plainly instead of as `{{skill:…}}`.

## Shared text

A fact that more than one place states (what an error code means, what a request costs) lives once in `shared/text/<name>.md`, as one line of plain text with no `{{…}}`. A skill or a text file inlines it with `{{< name}}`; code uses `{{text:name}}`, which renders as a quoted string, and adds its own words around it. Snippets stay plain text so they read right in both, and `npm run validate` fails on markdown in one (backticks, `*`, a link or a heading), and warns about one nothing uses yet.

## Code hosts

`kind: code` in `vars.yaml` makes a host whose output isn't a plugin but files for somewhere else: code for another project (a piece as it sits in that project's repo), or a listing a marketplace reads. A code host ships only its own files, with `{{…}}` filled in source files too: no shared skills, `LICENSE` or assets, and no `plugin.json`. Its `README.md` documents it here and isn't shipped or rendered; `npm run validate` requires one, and the render fails if the host has a `skills/` folder. It needs no release-please entry until it's released from this repo.

A code host whose output is better generated whole than written as a template, such as a marketplace listing, has a `scripts/render.mjs`. Its default export gets `{ values, fill, apiEndpoints, apiNotOffered }` and returns `{ "<path in dist/<host>>": text }`. `values` is the host's `vars.yaml`; `apiEndpoints()` lists the endpoints we offer (`shared/billing.yaml`), with their id, name, description, server, inputs, example, where they take the key (`keyIn`) and billing kind (an operation `shared/endpoints.yaml` splits as those endpoints), and `apiNotOffered()` the operations we don't. Every API operation must be in `shared/billing.yaml`, so a new one fails the render until it's placed; `fill(text)` fills a template's placeholders, so the host's fixed parts can stay in a YAML template next to the script. The render runs it after the host's other files and fails if it throws or returns a path the host already has.

## Keeping hosts current with the API

A code host takes what it sends to the API from the published spec (`{{openapi_url}}`, which is `https://www.zenrows.com/openapi.json`), with an `{{api:…}}` placeholder, instead of writing it out:

| Placeholder | Renders to |
|---|---|
| `{{api:GET / query url,mode}}` | the named query parameters of `GET /` as one line of JSON Schema: each one's type, enum, default and description from the spec, and which are required. Without names, all of them. |
| `{{api:GET /jobs/{job_id} path}}` | its path parameters |
| `{{api:POST /jobs body}}` | its JSON body, with the spec's `$ref`s inlined |
| `{{api:POST /jobs summary}}`, `{{api:POST /jobs description}}` | the operation's summary or description, as a JSON string |
| `{{api:POST /jobs server}}` | its base URL: the operation's `servers`, else the path's, else the spec's |
| `{{api:POST /crawls example}}` | its example request, `{ queryParams, pathParams, body }`, from the spec's parameter and body examples |
| `{{api:GET / responses}}`, `{{api:GET / responses 400,403}}` | what each response status means, `{ "<status>": description }`, for the statuses the spec describes, or the ones named |
| `{{api-sha256}}` | the sha256 of the spec |

JSON is valid YAML, so the same placeholder works in a YAML listing (`queryParams: {{api:GET / query url,mode}}`) and in code (`const fetchParams = {{api:GET / query url,mode}};`). The render fails on an operation or parameter the spec doesn't have, and on a summary, description or server it doesn't give.

Where the spec has one operation for what hosts offer as several endpoints (`GET /` is both Fetch and Extract), `shared/endpoints.yaml` defines each one once: its operation, its query parameters, and its own name and description where the spec's don't fit. A placeholder names it instead of the operation, `{{api:extract query}}` or `{{api:extract summary}}`, and the render fails on a parameter its operation doesn't take.

The render and validate download the spec each run and keep the last copy in `.cache/openapi.json` for when the network is down (CI caches it the same way); `ZENROWS_OPENAPI=<file>` uses a file instead. When the spec changes, the docs repo pings this one and `.github/workflows/api-changed.yml` checks every host against it: on a failure it opens (or updates) the issue "API change: hosts to update" and posts to #proj-integrations; a clean run closes the issue, and if the placeholders now render differently, it opens a pull request with the re-rendered files.

## Tests

`npm test` (CI runs it too) checks that render and validate catch the mistakes they're meant to: each case in `scripts/test.mjs` makes one change in a temporary copy of the repo (a throwaway code host, a snippet, …) and expects a given error, or a pass. When you add a rule, add a case that breaks it.

## Manifest schemas

A JSON file that declares a `"$schema"` (for example Copilot's `plugin.json` and `mcp.json`) is checked against it by `npm run validate`. The schema is downloaded from that URL and cached in `.cache/schemas/` (git-ignored), so it's downloaded once per machine; CI keeps the same cache between runs. Schema URLs carry a version (`…/1.0.0/plugin.schema.json`), so the cache doesn't go stale. If the download fails, `npm run validate` fails and names the URL.

## Adding a host

Run `npm run new-host`. It asks for the host id (`platforms/<id>/`, `dist/<id>/`, tags `<id>-v1.2.3`) and the full product name, then creates `platforms/<id>/` from templates:

- `vars.yaml`, with defaults and comments for every setting;
- a generic `plugin.json` and `mcp.json`;
- the README;
- the `getting-started` sign-in slot.

It also adds the host to `release-please-config.json` and `.release-please-manifest.json` at `0.1.0`. Answers can also be piped in, one per line.

What only a person can decide is marked `TODO(new-host)`, and `npm run validate` fails until it's done: the install and sign-in steps, where the agent can write files, whether releases are uploaded by hand (`upload:`), and the plugin files. Each host reads its own layout (Claude: `.claude-plugin/plugin.json` and `.mcp.json`; Cursor: `.cursor-plugin/plugin.json`), so move the templates to those paths, add the fields the host needs, update the manifest path in `release-please-config.json`, and add a marketplace catalog at the top of the repo if the host installs from a subfolder. Use an existing `platforms/<host>/` as the example. Then run `npm run render` and commit `platforms/<id>/`, `dist/<id>/`, the release-please files and `README.md` together. The render adds the host to the "Supported hosts" list in `README.md`, so don't add it by hand.

## Commits and releases

Commit messages and PR titles follow Conventional Commits. `fix`, `feat` and `perf` need a scope, for example `fix(crawl): …`. The commit-hygiene check rejects trailers, issue tracker keys and AI attribution.

To open a PR as `claude[bot]` instead of yourself, push the branch and run `gh workflow run open-pr-as-claude.yml --ref main -f branch=<branch> -f title="…" -F body=@pr-body.md`. It opens a draft assigned to you, which you can then approve, because you are not its author.

A merged PR's title becomes an entry in its host's `CHANGELOG.md`, so for `feat`, `fix` and `perf` write what changes for someone using the plugin, not how the repo changed, for example `feat(crawl): the crawl skill runs one server-side Crawl job instead of a scrape loop, so include and exclude patterns work`. A PR with several such changes can list them, one title per line, between `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE` at the end of its description; each line becomes its own entry. The same block fixes an entry after the merge: release-please reads it on the next push to main.

Each host is its own release-please package (`dist/<host>`), with its own version and tag (`copilot-v0.1.2`). A merge that changes `dist/<host>/` opens or updates that host's release PR; merging the release PR tags it and creates the GitHub release. The release PR also adds the version's entry to `dist/<host>/CHANGELOG.md`, from the `feat`, `fix`, `perf` and `revert` commits since the last release, so the changelog ships with the plugin and its mirror. The render keeps that file as it is.

### Mirror repos

Some installs name a repo of their own instead of a folder here: `copilot plugin marketplace add ZenRows/copilot-zenrows` reads that repo's root, and so do the Cursor Marketplace and ClawHub. Such a repo is a mirror: `mirror: ZenRows/copilot-zenrows` in the host's `vars.yaml` makes each release of the host replace the mirror's contents with `dist/<host>/`, plus a banner in its README pointing here. If the host has marketplace catalogs, the mirror gets them at the same paths, listing only that host with `source` set to `./` (the mirror's root), so the catalog is edited in one place. A host that reads its plugin from the repo root, like Cursor or OpenClaw, needs no catalog. Nobody edits a mirror by hand; only its deploy key can push to it.

- The release workflow runs `.github/workflows/mirror.yml` for each released host. It makes one normal commit (`release copilot-v0.1.2 from ZenRows/zenrows-integrations@<sha>`), never a force-push, and tags the mirror `v<version>`. No commit is made when nothing changed, so a re-run is safe.
- It pushes with the deploy key in the `MIRROR_KEY_<HOST>` secret of the `release` environment. The key, the mirror's branch protection and its settings are in [iac-bootstrap](https://github.com/ZenRows/iac-bootstrap).
- To see what the mirror would get: `npm run mirror -- <host> <clone of the mirror> [<release tag>]`, then `git diff` in the clone. To publish by hand (for example after fixing a failed run), run the Mirror workflow from Actions with the host and the release tag; it's a dry run unless you untick it. With no tag it publishes `main`'s `dist/<host>/`, names the commit in the README banner and tags nothing.
- Manual runs, dry runs included, start from `main`: the job uses the `release` environment, which only deploys from `main`.

### Uploads by hand

Some hosts take each release only as an upload that someone does by hand, for example a marketplace that reviews every version. Every host's `vars.yaml` says which:

- `upload: false`: installs read this repo or the host's mirror, so nothing is uploaded.
- `upload:` with `to:` (where, for example `Cursor Marketplace`) and `url:` (an `https://` link to the page you upload on): each release of the host posts a reminder to #proj-integrations naming the release, its files in `dist/<host>/` at the tag, and that link.

`npm run validate` fails if a released host has no `upload:`. A host with no release-please entry (a code host not released from here) never posts a reminder, so it leaves `upload:` out, or writes `false`. `.github/workflows/upload-reminder.yml` posts through a Slack incoming webhook in the `SLACK_WEBHOOK_INTEGRATIONS` secret of the `release` environment and tags @ZenGrow. Without the secret, the job fails, so a missed reminder shows as a red run; the message is still in its job summary. To send a reminder again, run the Upload reminder workflow from Actions, on `main`, with the host and the release tag; it's a dry run unless you untick it.
