#!/usr/bin/env bash
# Shared implementation of the Linear key guard. See ../action.yml for the contract.
#
# THE RULE, and it is one rule rather than a mode switch:
#
#   A bare `DAG-123` is allowed ONLY if that same key appears in the branch name.
#   Every other key must be written with a space: `DAG 123`.
#
# Why one rule covers both kinds of repo, with no configuration:
#
#   CODE REPO   `feat/dag-142-parquet-writer` -> `DAG-142` may appear bare in the title, body and
#               commits. That is the branch the work is on, Linear moving it on merge is CORRECT,
#               and the branch-naming standard requires the key for feat/fix/perf/hotfix. Any
#               OTHER key in those fields is a citation and must be spaced.
#   DOCS REPO   `docs/decisions-2026-08-25` carries no key, so the allowed set is empty and every
#               bare key is rejected. Identical to the standalone guard claude-context ran first.
#
# A blanket ban would have been wrong for code repos: it forbids exactly the transitions the
# integration exists to perform. The failure being blocked is a PR CITING an issue it is not
# delivering - data-gubbins#75 bounced DAG-223 that way while legitimately working DAG-242.
#
# NOT COVERED, deliberately: a branch correctly named after an issue that is ALREADY completed.
# Merging it walks that issue backwards and this guard permits it, because the branch key is in
# the allowed set. Nothing here can see the issue's state without a Linear credential, and the
# state-regression watcher in .github-private catches it within a day. Do not add an API call
# here to close that gap - it would put a secret in every repo's PR path for one rare case.
#
# THE DIFF IS NOT SCANNED. Tested 2026-08-22 and again on 2026-08-25: file content carrying
# hundreds of bare keys transitions nothing. Documents cite normally; only these four fields
# matter, which is what makes this guard cheap.
set -euo pipefail

# Case-insensitive: Linear matches `dag-305` and `DAG-305` alike and its own branch format emits
# lower case. The trailing boundary is [^0-9] rather than \b so `DAG-30` cannot hide inside
# `DAG-305`. ponytail: two team keys hard-coded; widen the alternation if a third appears.
KEY_RE='(^|[^A-Za-z0-9])(DAG|BCG)-[0-9]+([^0-9]|$)'

keys_in() { # $1 = text -> one UPPERCASE key per line, deduped
  printf '%s' "$1" | grep -oiE "$KEY_RE" | grep -oiE '(DAG|BCG)-[0-9]+' |
    tr '[:lower:]' '[:upper:]' | sort -u
  return 0   # grep exits 1 on no match; under `set -e` that would kill the run with an empty
             # report and a non-zero status - a guard that fails closed by accident and says
             # nothing, which reads exactly like a guard that fired. Found against PR #130.
}

if [ "${1:-}" = "--self-test" ]; then
  # Proven firing before it is trusted. A guard only ever shown to pass is a guard nobody has
  # shown to fire, which is the whole complaint this control was built to answer.
  fail=0
  check() { # $1 = label, $2 = expected, $3 = actual
    [ "$2" = "$3" ] || { echo "SELF-TEST FAIL [$1]: expected '$2', got '$3'"; fail=1; }
  }
  check "bare key found"      "DAG-305" "$(keys_in 'closes DAG-305 on merge')"
  check "lower case + adjacent punctuation" "DAG-154" "$(keys_in 'see dag-154.')"
  check "branch form"         "DAG-334" "$(keys_in 'feature/dag-334-linears-pr-automation')"
  check "spaced form ignored" ""        "$(keys_in 'per DAG 305, corrected')"
  check "path is not a key"   ""        "$(keys_in 'dag-backlog-audit-2026-08-19.md')"
  check "other id schemes"    ""        "$(keys_in 'ADR-0004 and MOI-3')"
  check "no prefix collision" "DAG-305" "$(keys_in 'DAG-305')"
  check "multiple, deduped"   "$(printf 'DAG-154\nDAG-160')" "$(keys_in 'DAG-154, DAG-160, dag-154')"
  [ "$fail" = "0" ] && echo "self-test: 8/8 ok"
  exit "$fail"
fi

title=$(cat "$1"); body=$(cat "$2"); branch="$3"; commits=$(cat "$4")

if printf '%s' "$body" | grep -qE '^[[:space:]]*linear-transition:[[:space:]]*intended[[:space:]]*$'; then
  echo "\`linear-transition: intended\` found — this PR is meant to move its issue. Guard stood down."
  exit 0
fi

# The allowed set is whatever the branch name declares. Empty for a keyless branch.
allowed=$(keys_in "$branch")
if [ -n "$allowed" ]; then
  echo "Branch declares $(printf '%s' "$allowed" | tr '\n' ' ')— these may appear bare."
else
  echo "Branch declares no issue key, so every bare key here is a citation."
fi

findings=""
for field in title body commits; do
  case "$field" in
    title)   text="$title";   label="PR title" ;;
    body)    text="$body";    label="PR body" ;;
    commits) text="$commits"; label="commit message(s)" ;;
  esac
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    printf '%s\n' "$allowed" | grep -qx "$k" && continue
    findings="${findings}- \`$k\` in the **$label**"$'\n'
  done <<< "$(keys_in "$text")"
done

[ -n "$findings" ] || { echo "No unexpected Linear keys in the four scanned fields."; exit 0; }

cat >&2 <<MSG
Linear issue keys found in fields the GitHub integration scans, which this branch does not claim:

$findings
Merging as-is transitions those issues. A docs PR has bounced completed issues back to In Review
(DAG-154, DAG-160, 2026-08-16), closed an unfinished one outright (DAG-305, 2026-08-19), and marked
never-started work Done from a PR title alone (DAG-265, 2026-08-13, unnoticed for eleven days).

Fix: write the citation with a space — \`DAG 305\`, not \`DAG-305\`. It reads identically. Files in
the diff are NOT scanned, so cite normally inside documents.

If this PR really does deliver that issue's work, either name the branch after it, or add a line
reading
  linear-transition: intended
to the PR body.
MSG
exit 1
