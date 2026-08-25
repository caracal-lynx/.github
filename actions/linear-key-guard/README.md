# Linear key guard

Fails a pull request that carries a bare Linear issue key (`DAG-305`, `BCG-77`) in a field
Linear's GitHub integration scans, unless the branch name declares that key.

## Why

Linear transitions an issue when a bare key appears in a merged PR's **title, body, branch name
or commit message**. It cannot tell a citation from a claim of work. Measured damage in
`caracal-lynx` before this existed:

| When | What happened |
|---|---|
| 2026-08-16 | `claude-context#117` bounced DAG-154 and DAG-160 out of `Done`, months after completion. Burndown misreported for six days |
| 2026-08-19 | `claude-context#130` closed an unfinished DAG-305 two seconds after merge — from its **commit message**, while its body was carefully spaced |
| 2026-08-13 | `claude-context#110` took DAG-265 `Backlog → Done` in forty seconds from its **title alone**. No work behind it, undetected for eleven days |

The rule had been written in prose three times and broken three times. See DAG 334.

## Usage

```yaml
name: Linear key guard
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read
  pull-requests: read

jobs:
  guard:                       # keep this job id stable — it is the check name
    runs-on: ubuntu-latest
    steps:
      - uses: caracal-lynx/.github/actions/linear-key-guard@v1
```

No checkout needed. No secrets. `caracal-lynx/.github` is public, so the action resolves without
a token.

`edited` is not optional: a PR body can be rewritten to add a key after a green run, with no push
to re-trigger anything.

## The rule

> A bare key is allowed **only** if the branch name declares it. Every other key must be written
> with a space — `DAG 305`.

One rule, no configuration, and it lands correctly on both kinds of repo:

- **Code repo** — `feat/dag-142-parquet-writer` lets `DAG-142` appear bare in the title, body and
  commits. That is the branch the work is on and Linear moving it on merge is *correct*; the
  branch-naming standard requires the key for `feat/fix/perf/hotfix`. Any **other** key is a
  citation and must be spaced.
- **Docs repo** — `docs/decisions-2026-08-25` declares nothing, so every bare key is rejected.

A blanket ban would forbid exactly the transitions the integration exists to perform.

**The diff is not scanned.** Documents may cite hundreds of keys with hyphens and transition
nothing — tested twice. Only those four fields matter, which is what makes this cheap.

## Escape hatch

A PR that genuinely delivers an issue's work, from a branch not named after it, adds a line to
its body:

```text
linear-transition: intended
```

The guard stands down entirely. Deliberately a visible line in the artefact everyone reads,
rather than a label you can forget you set.

## What it does not cover

A branch correctly named after an issue that is **already completed**. Merging it walks that issue
backwards, and this guard permits it — the key is in the allowed set. Nothing here can see an
issue's state without a Linear credential, and putting one in every repo's PR path for that case is
a bad trade. The state-regression watcher in `.github-private` catches it within a day.

## Enforcing it

The check is advisory until it is required. Add a **repo-level** ruleset:

```powershell
$body = @{
  name        = '<repo>-linear-key-guard'
  target      = 'branch'
  enforcement = 'active'
  conditions  = @{ ref_name = @{ include = @('~DEFAULT_BRANCH'); exclude = @() } }
  rules       = @(@{
    type       = 'required_status_checks'
    parameters = @{
      strict_required_status_checks_policy = $false
      required_status_checks               = @(@{ context = 'guard' })
    }
  })
} | ConvertTo-Json -Depth 10 -Compress

$body | gh api repos/caracal-lynx/<repo>/rulesets -X POST --input -
```

Repo-level, never org-level: an org rule would require `guard` in every
repo, including those that do not run it, and block their PRs forever.
