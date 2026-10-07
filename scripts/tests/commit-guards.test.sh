#!/usr/bin/env bash
#
# Tests for the commit guards: scripts/validate-commit-message.sh and the
# .githooks/pre-push direct-main refusal. Run by scripts/check.sh.
#
#   bash scripts/tests/commit-guards.test.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
validator="$root/scripts/validate-commit-message.sh"
pre_push="$root/.githooks/pre-push"
pass=0
fail=0

check() {
  local desc="$1" want="$2" rc="$3"
  if [[ "$rc" -eq "$want" ]]; then
    pass=$((pass + 1))
  else
    echo "  FAIL: $desc (wanted exit $want, got $rc)"
    fail=$((fail + 1))
  fi
}

# expect <accept|reject> <description> <message>
expect() {
  local want=0 rc=0
  [[ "$1" == "reject" ]] && want=1
  printf '%s' "$3" | bash "$validator" --stdin >/dev/null 2>&1 || rc=$?
  check "$2" "$want" "$rc"
}

# Shape
expect accept "subject only" 'fix: pin intake backend test stores to the fixture clock'
expect accept "consecutive bullets" $'fix: do a thing\n\n- Change one thing\n- Change another thing'
expect accept "a trailing newline after the last bullet" $'fix: do a thing\n\n- Change one thing\n'
expect accept "an acronym later in the summary" 'docs: describe the FTS fallback'
expect accept "comment lines git strips itself" $'fix: do a thing\n# Please enter the commit message'
expect reject "no type" 'do a thing'
expect reject "a type outside the vocabulary" 'perf: make a thing faster'
expect reject "a scope" 'fix(sessions): do a thing'
expect reject "an upper-case summary" 'fix: Do a thing'
expect reject "a trailing period" 'fix: do a thing.'
expect reject "a phase marker" 'feat: build the composer (P1)'
expect reject "a subject over 72 characters" 'fix: do a thing that is described at really quite considerable and excessive length'
expect reject "no blank line after the subject" $'fix: do a thing\n- Change one thing'

# Body
expect reject "a prose body" $'fix: do a thing\n\nThis paragraph explains the change.'
expect reject "a blank line between bullets (9dfbe9a1)" $'test: add probes\n\n- Add one probe\n\n- Record another thing'
expect reject "a trailer after the bullets (03e02ae0)" $'test: measure a thing\n\n- Record timing\n\nRefs: #132'
expect reject "a wrapped bullet continuation" $'fix: do a thing\n\n- Change one thing that wraps\n  onto a second line'

# Attribution and decoration
expect reject "Co-Authored-By" $'fix: do a thing\n\n- Change one thing\n\nCo-Authored-By: Someone <x@example.com>'
expect reject "a Generated-with line" $'fix: do a thing\n\n- Generated with a tool'
expect reject "AI tool attribution" $'fix: do a thing\n\n- Written by Claude Code'
expect reject "an em dash" $'fix: do a thing\n\n- Change one thing \xe2\x80\x94 and another'

# Merge commits are git- or GitHub-written and exempt from shape rules
expect accept "a GitHub PR merge" $'Merge pull request #137 from swarea/fix/storage-intake-test-clock\n\nfix: pin intake backend test stores to the fixture clock'
expect accept "merging main into a branch" "Merge branch 'main' into fix/sessions-kernel-rediscovery-merge"
expect accept "a CI merge ref" 'Merge 341700c7 into 0fd2af57'
expect reject "attribution inside a merge commit" $'Merge branch \'main\' into fix/x\n\nCo-Authored-By: Someone <x@example.com>'

# Usage
rc=0; bash "$validator" >/dev/null 2>&1 || rc=$?
check "no argument is a usage error" 2 "$rc"

# pre-push: refuse main, allow any other branch and branch deletion
zero=0000000000000000000000000000000000000000
push() { printf '%s\n' "$1" | bash "$pre_push" origin git@example.com:x.git >/dev/null 2>&1; }
rc=0; push "refs/heads/main abc refs/heads/main $zero" || rc=$?
check "pre-push refuses main" 1 "$rc"
rc=0; push "refs/heads/feat/x abc refs/heads/main def" || rc=$?
check "pre-push refuses a local branch pushed onto main" 1 "$rc"
rc=0; push "refs/heads/fix/x abc refs/heads/fix/x $zero" || rc=$?
check "pre-push allows a branch" 0 "$rc"
rc=0; push "(delete) $zero refs/heads/fix/x abc" || rc=$?
check "pre-push allows deleting a branch" 0 "$rc"

echo "commit guards: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
