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
    uses: caracal-lynx/.github/.github/workflows/node-ci.yml@main
    with:
      node-version: "24.16.0"
      os-matrix: '["ubuntu-latest", "windows-latest"]'
      package-manager: npm        # or "pnpm" — defaults to "npm"
      coverage: false             # true uploads a coverage artifact from ubuntu
```

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
    uses: caracal-lynx/.github/.github/workflows/node-release.yml@main
    with:
      node-version: "24.16.0"
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
- Optional but recommended: org vars `RELEASER_APP_ID` + secret
  `RELEASER_PRIVATE_KEY` for the `caracal-lynx-releaser` GitHub App. Without
  these the workflow falls back to `GITHUB_TOKEN`, which means release PRs
  may need manual approval before CI can run on them.

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

- This repo's reusable workflows reference first-party GitHub Actions
  (`actions/*`, `pnpm/action-setup`, `changesets/action`) by **major version
  tag** (e.g. `actions/checkout@v6`). Renovate keeps these bumped weekly.
- Third-party actions that are less well-known should be pinned to commit SHA
  with a comment naming the version, per `[SEC-?]` of the company
  TypeScript standards.
- Consumers pin this repo's workflows with `@main` for the bleeding edge, or
  `@v1` (once we cut tagged releases) for stability. The `@main` path is
  fine for the early rollout; switch to `@v1` once breaking changes become
  a real concern.

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

- **DAG-52** — Implement Recommendations from dev pipeline session (parent)
- **DAG-63** — Create caracal-lynx/.github repo with reusable workflows (this)
- **DAG-73** — Wire Sluice to use the central reusable workflow (pilot consumer)
- **DAG-75** — Roll out central CI to remaining Data Gubbins repos
- **DAG-76** — Add CI check that fails PRs touching `src/` without a changeset
  (will fold into `node-ci.yml` as an opt-in input once piloted on Sluice)
