# caracal-lynx/.github

Organisation-default content + reusable CI workflows for Caracal Lynx Limited.

This repo is consumed automatically by every other repo in the `caracal-lynx`
GitHub org — for community files (issue templates, profile README) and as the
source of truth for reusable GitHub Actions workflows. Companion private repo:
[`caracal-lynx/.github-private`](https://github.com/caracal-lynx/.github-private)
for content that should only apply to private repos.

## What lives here

| Path | Purpose |
|---|---|
| `.github/workflows/node-ci.yml` | Reusable CI for Node/TypeScript packages — lint, typecheck, test (matrix), build, audit |
| `.github/workflows/node-release.yml` | Reusable release flow — Changesets PR + npm publish via Trusted Publishing (OIDC) |
| `renovate-config.json` | Shared Renovate preset (extend with `local>caracal-lynx/.github:renovate-config`) |
| `workflow-templates/` | Templates that appear in the "New workflow" picker for every org repo |
| `.github/ISSUE_TEMPLATE/` | Org-default bug-report + feature-request issue forms; `config.yml` disables blank issues and links to Linear |
| `.github/PULL_REQUEST_TEMPLATE.md` | Org-default PR template (Summary / Test plan / Related Linear). Dependency PRs select the named `PULL_REQUEST_TEMPLATE/dependency_change.md` via `?template=` |
| `CODEOWNERS` | Review ownership for **this repo only** (GitHub has no org-wide CODEOWNERS) |
| `profile/README.md` | The org's public landing page at <https://github.com/caracal-lynx> |

## Who consumes this

Community files (issue templates, PR template, profile README) are inherited by **every**
repo in the org automatically. The reusable workflows and the Renovate preset are opted
into, and today that is:

| Repo | `node-ci.yml` | `node-release.yml` | `renovate-config` |
|---|---|---|---|
| `data-gubbins` — the platform monorepo | yes | yes | yes |
| `sluice-client-eribe` — client engagement | yes | no | yes |
| every other active repo | no | no | yes |

**The platform monorepo is the fuller consumer of the two, not an exception to them.**
Worth stating because the opposite was written down: DAG 225 recorded that after the
monorepo cutover these workflows "serve only client repos … the platform monorepo runs
local workflows", and proposed slimming this repo to match. `data-gubbins/ci.yml` and
`data-gubbins/release.yml` both call them, so acting on that would have removed presets
and docs that the fleet's busiest repo depends on.

The Renovate preset is extended by every active repo and carries fleet-wide holds — the
`typescript <7.0.0` ceiling lives here, hoisted on 2026-07-24 so no repo could miss it
(DAG 252). It is not per-repo configuration and must not be trimmed to one consumer.

## Consuming the workflows

### CI (every PR)

Drop this into `.github/workflows/ci.yml` in any Node/TypeScript repo:

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  ci:
    uses: caracal-lynx/.github/.github/workflows/node-ci.yml@v1.17.1
    with:
      node-version-file: .nvmrc   # preferred — the repo's own file is the source of truth
      os-matrix: '["ubuntu-latest", "windows-latest"]'
      package-manager: npm        # or "pnpm" — defaults to "npm"
      coverage: false             # true uploads a coverage artifact from ubuntu
```

### Node version: use `node-version-file`

Set **exactly one** of `node-version-file` (preferred) or `node-version`. Supplying
both fails the run — `setup-node` would silently prefer `node-version` and ignore the
file. Supplying neither also fails, rather than quietly using whatever Node the runner
happens to ship.

Prefer `node-version-file: .nvmrc` because it makes the repo's own file the single
source of truth. A literal `node-version` is a pin duplicated into every workflow, and
duplicated pins drift: `sluice-client-eribe` ran CI on Node 24.16.0 for **53 days**
while its own `package.json` declared `>=24.18.0`, because Renovate can raise an
`engines` field but cannot touch a version string inside a workflow input. The only
symptom was a `[WARN]` line nobody read.

`.nvmrc` also drives local development — with `fnm env --use-on-cd` the right Node
selects itself on `cd`, so CI and laptops run the same version by construction rather
than by discipline.

`node-version` has **no default**. It previously defaulted to `"24.16.0"`, which meant
omitting it silently pinned a consumer below every current repo's `engines.node` floor.

**Required scripts in the consumer's `package.json`:** `lint`, `typecheck`,
`build`, `test` (and `test:cov` if `coverage: true`).

### Release (push to default branch)

Drop this into `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [master, main]
  workflow_dispatch:

jobs:
  release:
    uses: caracal-lynx/.github/.github/workflows/node-release.yml@v1.17.1
    with:
      node-version-file: .nvmrc   # preferred — see note below
      package-manager: npm
    secrets: inherit              # workflow reads RELEASER_PRIVATE_KEY, etc.
```

**Prerequisites in the consuming repo:**

- `@changesets/cli` + `@changesets/changelog-github` installed
- `.changeset/config.json` configured
- `version` and `release` scripts in `package.json` (Sluice's are the canonical example)
- **npm Trusted Publisher configured** at `npmjs.com/package/<name>/access` —
  authorise this workflow by org + repo + filename. Without this, publishing
  fails at the `npm publish` step with a 403.
- Optional but recommended: org var `RELEASER_CLIENT_ID` + secret
  `RELEASER_PRIVATE_KEY` for the `caracal-lynx-releaser` GitHub App. Without
  these the workflow falls back to `GITHUB_TOKEN`, which means release PRs
  may need manual approval before CI can run on them.
  **It is `RELEASER_CLIENT_ID`, not `RELEASER_APP_ID`** — `create-github-app-token`
  deprecated the `app-id` input, and both the mint step and the preflight that gates
  it moved to the client id on 2026-08-28 (DAG 210). `RELEASER_APP_ID` still exists
  only so consumers pinned below `v1.17.1` keep working; it will be deleted once no
  reachable pin references it.

**Registry read auth:** both `node-ci.yml` and `node-release.yml` always pass
the inherited `NPM_READ_TOKEN` to every install/precheck step, so restricted
`@caracal-lynx/*` dependencies resolve without per-repo configuration. It is
empty and harmless when the org has no such secret, and the publish itself
still authenticates via OIDC Trusted Publishing. The legacy `npm-read-auth`
input on `node-release.yml` is a deprecated no-op kept only for backward
compatibility (DAG-162).

### Renovate preset

In each repo's `.github/renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["local>caracal-lynx/.github:renovate-config"]
}
```

This pulls in the shared defaults: Monday-morning schedule, grouping for
`@types/*` / dev deps / GitHub Actions, automerge for non-major dev updates,
**no** automerge for runtime deps (they ship to users — manual review),
and immediate firing on vulnerability alerts.

## Pinning & versioning

- **First-party GitHub Actions** (`actions/checkout`, `actions/setup-node`,
  `actions/upload-artifact`, `actions/create-github-app-token`) are referenced by
  **major-version tag** (e.g. `actions/checkout@v7`). They're GitHub-owned (low
  supply-chain risk) and Renovate keeps them bumped weekly.
- **Third-party actions** (`pnpm/action-setup`, `changesets/action`,
  `linear/linear-release-action`) are pinned to a **full commit SHA** with a
  `# vX.Y.Z` comment (e.g. `pnpm/action-setup@0977fd9…999 # v6.0.10`). The SHA
  defends against tag
  re-pointing; the comment lets Renovate read the version intent and bump the
  SHA + comment together. Per `[SEC-?]` of the company TypeScript standards, and
  the policy comment at the top of each workflow (DAG-78).
- **Consumers pin this repo's workflows to an exact tag** — `@v1.17.1`, not `@v1`
  and not `@master`. Renovate raises a PR when a new tag lands, so the bump is
  reviewed in the consumer's own CI rather than arriving unannounced. There is no
  `main` branch here; the default branch is `master`, and pinning to it would give
  every consumer whatever happened to be merged that morning.
- **The pins in this file are maintained by hand; the ones in `workflow-templates/` are
  not.** Renovate bumps a `uses:` reference in YAML but cannot parse a fenced code block
  in Markdown, so the examples above drift while the templates stay current. They had
  reached `v1.16.2` against a live `v1.17.1` — three tags behind — while the templates
  were one patch behind and self-correcting. If you cut a tag, update this file too.

## Releasing this repo

A tag here is a fleet-wide release. There is no release branch and no changelog
step, so **a tag contains everything merged since the previous tag** — not the PR
you just merged.

**Diff before you tag:**

```powershell
git -C C:
git -C C:\repos\.github fetch origin --tags
git log --oneline v1.17.1..master     # every commit the next tag would ship
git diff --stat v1.17.1..master
```

This is not hypothetical. `v1.16.0` was cut to release `node-version-file` (#51)
and shipped **six** commits, among them the `changesets/action` v2 major (#46)
whose renamed inputs were never migrated. That major had sat harmlessly on
`master` for a week precisely *because* consumers pin tags — tagging is what
activated it, and `data-gubbins`' `Release` broke on adoption. See DAG-326/DAG-327.

Pushing a `v*` tag fires `.github/workflows/release-notes.yml`, which creates a
GitHub Release listing every PR in the range. Read it after tagging: an
unexpected PR in that body means the tag shipped more than you thought, and you
can cut a follow-up before a consumer adopts it.

## Workflow templates in the UI

`workflow-templates/` powers the "New workflow" picker that every Caracal Lynx
repo sees. Two templates ship today:

- **Caracal Lynx — Node CI** — scaffolds the consumer `ci.yml` above
- **Caracal Lynx — Node Release** — scaffolds the consumer `release.yml` above

Click "Actions" → "New workflow" in any org repo and they appear at the top of
the picker, gated on the repo containing a `package.json`.

## What's NOT here (yet)

- **AL / BC Gubbins workflows** — different shape, will land separately under
  the BCG team. Likely lives in `.github-private` because the AL build flow
  references internal AppSource credentials.
- **Org-wide CODEOWNERS** — GitHub doesn't support this. Each repo needs its
  own. The CODEOWNERS in this repo only governs `caracal-lynx/.github` itself.

## Related Linear issues

History (all delivered): **DAG 63** created this repo, **DAG 73** piloted it on Sluice,
**DAG 75** rolled it to the rest of the fleet, and **DAG 76**'s changeset gate shipped as
the `require-changeset` input rather than remaining a separate check.

Live constraints a reader of this file should know about:

- **DAG 78** — the pinning policy in "Pinning & versioning" above. First-party actions on
  major tags, third-party on SHAs. Settled again on 2026-08-28 after `.github-private`
  had drifted to a stricter policy while citing this one.
- **DAG 326 / DAG 327** — why `smoke.yml` exists: this repo's own reusable workflows are
  executed on every PR, because a tag here is a fleet-wide release.
- **DAG 329** — the known gap in that smoke test. It cannot reach `node-release.yml`'s
  App-token and publish-path expressions, so those lines are linted but not executed.
- **DAG 359** — the Renovate preset's holds are asserted from `data-gubbins`, not from
  here. A hold added to `renovate-config.json` binds only if the consuming repo's
  manifest range already excludes everything above the ceiling.
