#!/usr/bin/env bash
#
# The single verification gate.
#
# Local runs and CI both call this script, so there is exactly one definition of
# "verified" and the two cannot drift. CI must never re-list these commands in
# YAML; it runs `scripts/check.sh --full`.
#
#   scripts/check.sh          fast pass: typecheck, tests, stylelint
#   scripts/check.sh --full   everything above plus the production build,
#                             the unused-file inventory, and the Rust pass
#
# The Rust pass is skipped when `src-tauri/` is untouched, because it is the
# expensive half. Any change to a dependency lockfile, a build config, or the
# verification scripts themselves forces the full pass regardless: those files
# can break an area the diff never mentions.
set -euo pipefail

cd "$(dirname "$0")/.."

FULL=0
[[ "${1:-}" == "--full" ]] && FULL=1

# Which files does this run cover? The union of what the branch has committed
# and what is still uncommitted in the working tree: locally the point of the
# gate is the work you are about to commit, and in CI the tree is clean so only
# the committed half contributes. Looking at committed changes alone would let a
# local run skip the very passes the uncommitted edit requires.
#
# On a detached or unknown base we assume the widest scope rather than silently
# skipping work.
changed_files() {
  local base committed uncommitted ref
  uncommitted="$(git status --porcelain --untracked-files=all 2>/dev/null | cut -c4- || true)"
  # `main` on a working clone; `origin/main` in CI, where a pull request is checked
  # out at a detached merge ref and no local branch of that name exists. `git
  # merge-base` resolves a name the way `rev-parse` does and will not reach for the
  # remote-tracking ref on its own, so naming both is what keeps the scope the same
  # in both places. Asking for only `main` made every CI run fall through to
  # __ALL__, which pulled the Rust pass onto a runner that cannot build it.
  for ref in main origin/main; do
    base="$(git merge-base HEAD "$ref" 2>/dev/null || true)"
    [[ -n "$base" ]] && break
  done
  if [[ -z "$base" ]]; then
    echo "__ALL__"
    return
  fi
  committed="$(git diff --name-only "$base" HEAD 2>/dev/null || echo "__ALL__")"
  printf '%s\n%s\n' "$committed" "$uncommitted" | sed '/^$/d' | sort -u
}

CHANGED="$(changed_files)"

widens_scope() {
  [[ "$CHANGED" == "__ALL__" ]] && return 0
  grep -qE '^(package-lock\.json|package\.json|tsconfig.*\.json|vite\.config\.|stylelint|knip\.json|scripts/|\.github/workflows/|src-tauri/Cargo\.(toml|lock))' <<<"$CHANGED"
}

touches_rust() {
  [[ "$CHANGED" == "__ALL__" ]] && return 0
  grep -qE '^src-tauri/' <<<"$CHANGED"
}

if widens_scope; then
  echo "· a shared config, lockfile, or script changed: running the full pass"
  FULL=1
fi

step() { echo ""; echo "── $1"; }

step "typecheck"
npm run check:types

step "tests"
npm test

step "stylelint"
npm run style:check

if [[ "$FULL" -eq 1 ]]; then
  step "production build"
  npm run build

  step "unused-file inventory (non-blocking)"
  npm run unused || true
fi

if [[ "$FULL" -eq 1 ]] && touches_rust; then
  step "cargo check · test"
  ( cd src-tauri && cargo check --locked && cargo test --locked )
elif touches_rust; then
  echo ""
  echo "· src-tauri changed: run scripts/check.sh --full before opening a PR"
fi

echo ""
echo "✓ verification passed"
