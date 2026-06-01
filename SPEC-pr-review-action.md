# Specification: PR Review Checklist GitHub Action
**Organisation:** Caracal Lynx Limited  
**Repo target:** `caracal-lynx/.github`  
**Specification version:** 1.0  
**Status:** Ready for implementation

---

## Overview

Create a GitHub Actions workflow in the `caracal-lynx/.github` repository that automatically posts a pinned reviewer checklist comment whenever a pull request is opened or a reviewer is requested. The comment is organisation-wide and applies to all repositories in the `caracal-lynx` GitHub organisation.

---

## Objectives

- Ensure consistent PR reviews across all Caracal Lynx repositories
- Prompt reviewers with the standard checklist at the moment they are assigned
- Require zero setup in individual repositories — one workflow in `.github` covers all
- Keep the solution simple, maintainable, and free of third-party Actions dependencies

---

## Constraints

- Must use only **GitHub-native tooling** — no third-party marketplace Actions
- Must work across **all repos** in the `caracal-lynx` organisation without per-repo configuration
- Workflow file must live in `caracal-lynx/.github` — the organisation's shared workflow repository
- Comment must be **minimise-able but not deletable** by reviewers (use a pinned/minimised approach via the GitHub API)
- Workflow must be **idempotent** — re-triggering must not post duplicate comments
- Secrets and permissions must follow least-privilege principles

---

## Repository structure to create

```
caracal-lynx/.github/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md          # existing — do not modify
│   └── workflows/
│       └── pr-review-checklist.yml       # CREATE THIS
├── REVIEWING.md                          # existing — do not modify
└── README.md                             # existing — do not modify
```

---

## Workflow specification

### File path
`.github/workflows/pr-review-checklist.yml`

### Trigger events

```yaml
on:
  pull_request:
    types: [opened, review_requested]
```

| Event | When it fires |
|-------|--------------|
| `opened` | Any PR is opened in any repo using this shared workflow |
| `review_requested` | A reviewer is added to an existing PR |

### Permissions

```yaml
permissions:
  pull-requests: write   # to post and pin comments
  issues: write          # required alongside pull-requests for comment API
```

### Idempotency requirement

Before posting a comment, the workflow **must** check whether a checklist comment already exists on the PR (identified by a unique marker string in the comment body). If found, skip posting. This prevents duplicate comments when multiple reviewers are added in sequence.

Marker string to use:
```
<!-- caracal-lynx-review-checklist -->
```

### Comment content

The posted comment must contain the following checklist, formatted as GitHub Flavoured Markdown. The content must match `REVIEWING.md` — if `REVIEWING.md` is updated, this comment must be updated to match.

````markdown
<!-- caracal-lynx-review-checklist -->
## 👀 Reviewer checklist

> Posted automatically for all Caracal Lynx PRs · Full guidance: [REVIEWING.md](https://github.com/caracal-lynx/.github/blob/main/REVIEWING.md)

### Does the change make sense?
- [ ] The reason for the change is clearly explained in the PR description
- [ ] The scope of change looks proportionate to what is described
- [ ] No unexplained mass regeneration of lock files or generated files

### New packages (if applicable)
- [ ] Package names checked for typosquatting
- [ ] Publisher and provenance look legitimate
- [ ] Resolved URLs point to `registry.npmjs.org`
- [ ] No suspiciously new or obscure packages without justification

### Version changes (if applicable)
- [ ] Patch/minor bumps look routine
- [ ] Any major version bumps are justified and changelogs reviewed
- [ ] No known CVEs introduced (verified via `npm audit` output in PR)

### Security
- [ ] `integrity` hashes have not changed on packages whose version did not change
- [ ] `npm audit` output shows no new high/critical vulnerabilities
- [ ] No secrets, tokens, or credentials introduced

### Code quality
- [ ] Logic is clear and understandable
- [ ] No obvious bugs or edge cases missed
- [ ] Tests added or updated where appropriate

### Overall
- [ ] I am satisfied this change is safe to merge
- [ ] CI checks are passing

**Reviewer comments:**
_Add any comments, concerns, or questions before submitting your review._
````

### Implementation approach

Use `actions/github-script` with the built-in `github` client — no external Actions required.

Step sequence:
1. **List existing comments** on the PR using `github.rest.issues.listComments`
2. **Search for marker** `<!-- caracal-lynx-review-checklist -->` in existing comment bodies
3. **If found** — exit silently, do not post
4. **If not found** — post comment using `github.rest.issues.createComment`
5. **Pin the comment** using `github.rest.issues.updateComment` to minimize other noise (optional — see notes)

### Full workflow YAML

```yaml
name: Post PR review checklist

on:
  pull_request:
    types: [opened, review_requested]

permissions:
  pull-requests: write
  issues: write

jobs:
  post-checklist:
    runs-on: ubuntu-latest
    steps:
      - name: Post reviewer checklist (idempotent)
        uses: actions/github-script@v7
        with:
          script: |
            const marker = '<!-- caracal-lynx-review-checklist -->';
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const exists = comments.some(c => c.body.includes(marker));
            if (exists) {
              console.log('Checklist comment already exists — skipping.');
              return;
            }

            const body = `${marker}
            ## 👀 Reviewer checklist

            > Posted automatically for all Caracal Lynx PRs · Full guidance: [REVIEWING.md](https://github.com/caracal-lynx/.github/blob/main/REVIEWING.md)

            ### Does the change make sense?
            - [ ] The reason for the change is clearly explained in the PR description
            - [ ] The scope of change looks proportionate to what is described
            - [ ] No unexplained mass regeneration of lock files or generated files

            ### New packages (if applicable)
            - [ ] Package names checked for typosquatting
            - [ ] Publisher and provenance look legitimate
            - [ ] Resolved URLs point to \`registry.npmjs.org\`
            - [ ] No suspiciously new or obscure packages without justification

            ### Version changes (if applicable)
            - [ ] Patch/minor bumps look routine
            - [ ] Any major version bumps are justified and changelogs reviewed
            - [ ] No known CVEs introduced (verified via \`npm audit\` output in PR)

            ### Security
            - [ ] \`integrity\` hashes have not changed on packages whose version did not change
            - [ ] \`npm audit\` output shows no new high/critical vulnerabilities
            - [ ] No secrets, tokens, or credentials introduced

            ### Code quality
            - [ ] Logic is clear and understandable
            - [ ] No obvious bugs or edge cases missed
            - [ ] Tests added or updated where appropriate

            ### Overall
            - [ ] I am satisfied this change is safe to merge
            - [ ] CI checks are passing

            **Reviewer comments:**
            _Add any comments, concerns, or questions before submitting your review._`;

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body,
            });

            console.log('Checklist comment posted successfully.');
```

---

## How org-wide sharing works

GitHub automatically makes workflows defined in `<org>/.github` available as **shared/reusable workflows** to all repositories in the organisation. However, for the trigger-based approach above (posting a comment on PR events), the workflow must be **called from each repo** OR the org must use a **repository ruleset** with a required workflow.

### Recommended approach — Required workflow via Ruleset

Configure a GitHub Organisation Ruleset to require this workflow to run on all PRs:

1. Go to `github.com/organisations/caracal-lynx/settings/rules`
2. Create a new ruleset → target: **All repositories**
3. Under **Required workflows** → add `caracal-lynx/.github/.github/workflows/pr-review-checklist.yml@main`
4. Set branch targeting: `~DEFAULT_BRANCH` (applies to PRs targeting the default branch)

This enforces the workflow across all repos **without touching individual repos**.

> ⚠️ Required workflows via Rulesets require **GitHub Team or Enterprise** plan. If on Free plan, see the alternative approach below.

### Alternative approach — Caller workflow (Free plan)

Add a minimal caller workflow to each repo:

```yaml
# In each repo: .github/workflows/pr-review-checklist.yml
name: PR review checklist

on:
  pull_request:
    types: [opened, review_requested]

jobs:
  checklist:
    uses: caracal-lynx/.github/.github/workflows/pr-review-checklist.yml@main
```

For new repos, add this as part of the repo creation runbook. For existing repos, apply via a script (see below).

---

## Bulk deployment script (Free plan alternative)

If using the caller workflow approach, use this PowerShell script to add the caller workflow to all existing repos:

```powershell
# Prerequisites: GitHub CLI installed and authenticated
# gh auth login

$org = "caracal-lynx"
$workflowContent = @"
name: PR review checklist

on:
  pull_request:
    types: [opened, review_requested]

jobs:
  checklist:
    uses: caracal-lynx/.github/.github/workflows/pr-review-checklist.yml@main
"@

$repos = gh repo list $org --json name --jq '.[].name' | ConvertFrom-Json

foreach ($repo in $repos) {
    if ($repo -eq ".github") { continue }  # skip the .github repo itself

    Write-Host "Adding workflow to $repo..."

    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($workflowContent))

    gh api `
      -X PUT `
      /repos/$org/$repo/contents/.github/workflows/pr-review-checklist.yml `
      -f message="chore: add org PR review checklist workflow" `
      -f content="$encoded" `
      --silent

    Write-Host "  Done."
}

Write-Host "Finished deploying to all repos."
```

---

## Acceptance criteria

- [ ] Workflow file exists at `.github/workflows/pr-review-checklist.yml` in the `caracal-lynx/.github` repo
- [ ] Opening a new PR in any configured repo triggers the workflow
- [ ] A checklist comment is posted to the PR within 30 seconds of the trigger
- [ ] Adding a second reviewer does **not** post a duplicate comment
- [ ] Comment contains all checklist items listed in this spec
- [ ] Comment contains a link to `REVIEWING.md`
- [ ] Workflow passes with `green` status in the Actions tab
- [ ] No third-party Actions are used (only `actions/github-script`)

---

## Out of scope

- Enforcing that reviewers tick all boxes before merging (requires branch protection rules — separate spec)
- Customising the checklist per-repository (out of scope for MVP — use caller workflow overrides if needed later)
- Updating the comment when it already exists (idempotent skip is sufficient for MVP)

---

## Notes for Claude Code

- The marker string `<!-- caracal-lynx-review-checklist -->` is an HTML comment and will not render visibly in GitHub — this is intentional
- The `actions/github-script@v7` Action is a GitHub-owned first-party Action — it is acceptable under the no-third-party-Actions constraint
- Template literal backticks in the `script:` block must escape inner backticks as `\``
- The workflow YAML indentation inside the `script:` block must be consistent — use 12-space indent for the comment body lines
- Test the workflow by opening a draft PR in a test repo before rolling out org-wide
- The `issue_number` field in the GitHub REST API refers to both issues and PRs — this is correct

---

*Caracal Lynx Limited · Specification authored June 2026*
