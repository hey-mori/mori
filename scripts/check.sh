#!/usr/bin/env bash
#
# The single verification gate. `.gitattributes` keeps it LF-only so bash can
# read it from a Windows checkout; it is tracked as mode 100755 so it can be run
# directly as `scripts/check.sh` on Linux and macOS. The "commit guards" step
# below fails if any script or hook loses that mode.
#
# Local runs and CI both call this script, so there is exactly one definition of
# "verified" and the two cannot drift. CI must never re-list these commands in
# YAML; it runs `scripts/check.sh --full`.
#
#   scripts/check.sh          fast pass: typecheck, tests, stylelint
#   scripts/check.sh --full   everything above plus the production build,
#                             the unused-file inventory, and the Rust pass
#
# Resource limits (the machine is shared with other sessions and services; see
# docs/test-run-safety.md). Tests run through scripts/run-tests.mjs, which caps
# workers, heap and wall-clock time; the build and the Rust pass run under the
# same group timeout. One heavy Mori job at a time per machine (see below).
#   MORI_TEST_MAX_WORKERS   Vitest workers              (default 2)
#   MORI_TEST_HEAP_MB       V8 heap per Node process    (default 2048)
#   MORI_TEST_TIMEOUT_S     test wall-clock limit       (default 900)
#   MORI_TEST_KILL_GRACE_S  SIGTERM to SIGKILL grace    (default 15)
#   MORI_CARGO_JOBS         cargo -j and test threads   (default 2)
#   MORI_TEST_SAMPLE_MS     process-group sampling      (default 500)
#
# The Rust pass is skipped when `src-tauri/` is untouched, because it is the
# expensive half. Any change to a dependency lockfile, a build config, or the
# verification scripts themselves forces the full pass regardless: those files
# can break an area the diff never mentions.
set -euo pipefail

cd "$(dirname "$0")/.."

# One heavy Mori job at a time on this machine, whichever worktree it runs
# from: this gate, a standalone test run, the harness and a standalone limited
# step all take /tmp/mori-heavy.lock (a fixed path, not $TMPDIR). A second job
# fails at once (exit 75) rather than waiting unseen.
#
# The gate locks the file on fd 9 for its whole life; the kernel releases it
# when the gate and everything holding fd 9 have ended. The test wrappers this
# gate starts directly with `node` inherit fd 9 (Node passes it no further,
# so never through npm), and MORI_HEAVY_LOCK_FD names it as a hint only:
# scripts/run-tests.mjs verifies the descriptor is this lock file and that
# flock succeeds on that very descriptor before running under it, so a stray
# or forged variable can never let two jobs overlap. Without flock (stock
# macOS) there is no machine-wide lock; such a machine is not shared.
heavy_busy() {
  echo "another heavy Mori job holds $1: jobs never overlap on this machine; wait for it, do not stop it" >&2
  exit 75
}
HEAVY_LOCK="/tmp/mori-heavy.lock"
# The same lookup as scripts/run-tests.mjs (absolute system paths only), so
# the gate and the wrappers always agree on whether there is a lock at all.
FLOCK=""
for dir in /usr/bin /bin /usr/local/bin; do
  if [[ -x "$dir/flock" ]]; then FLOCK="$dir/flock"; break; fi
done
if [[ -n "$FLOCK" ]]; then
  # Opening can fail if another user created the file (protected_regular).
  if ! { : 9>>"$HEAVY_LOCK"; } 2>/dev/null; then
    echo "cannot open $HEAVY_LOCK (owned by another user?): no gate can run until that is fixed" >&2
    exit 75
  fi
  exec 9>>"$HEAVY_LOCK"
  "$FLOCK" -n 9 || heavy_busy "$HEAVY_LOCK"
  export MORI_HEAVY_LOCK_FD=9
else
  # Stock macOS has no flock. Such a machine is not shared, so the gate runs
  # bounded but without a machine-wide lock, and says so.
  echo "· no flock on this machine: no machine-wide heavy-job lock" >&2
  unset MORI_HEAVY_LOCK_FD
fi

FULL=0
NO_RUST=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    # For CI only, where the macOS job owns the Rust pass: ubuntu carries no
    # gtk/webkit for wry to build against, so asking it to run cargo fails on a
    # missing system package rather than on anything about the change. A working
    # clone has one toolchain and no jobs to divide work between, so a local
    # `--full` still runs everything.
    --no-rust) NO_RUST=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

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
# Steps that are not run-tests.mjs wrappers do not need the gate's lock
# descriptor; 9>&- keeps a stray child of theirs from holding the lock.
npm run check:types 9>&-

step "test safeguards"
# Proves the limits below still work (argument refusals, timeout, SIGKILL
# escalation, the orphan watchdog, the heavy-job lock) with sleeps, not tests.
# Its drills use private lock files only, never the gate's descriptor.
env -u MORI_HEAVY_LOCK_FD node scripts/run-tests.mjs self-check 9>&-

step "tests"
# The same command as `npm test`, called directly: the wrapper must inherit
# fd 9 from this shell, and npm (Node) passes no extra descriptors on.
node scripts/run-tests.mjs suite

step "stylelint"
npm run style:check 9>&-

step "prose"
npm run check:prose 9>&-

step "commit guards"
# Git ignores a hook without the executable bit, silently, and a script without
# it fails as Permission denied. Windows checkouts do not preserve the bit, so
# check the tracked mode rather than the working tree's.
not_executable="$(git ls-files -s -- scripts .githooks \
  | awk '$1 != "100755" && ($4 ~ /\.sh$/ || $4 ~ /^\.githooks\/[^/]+$/) { print $4 }')"
if [[ -n "$not_executable" ]]; then
  echo "not tracked as executable (fix with: git update-index --chmod=+x <file>):" >&2
  echo "$not_executable" >&2
  exit 1
fi
bash scripts/check-line-endings.sh 9>&-
bash scripts/tests/commit-guards.test.sh 9>&-
# The branch's own commits, against docs/commit-format.md. Older history is not
# re-judged: published commits are never rewritten here.
policy_base=""
for ref in main origin/main; do
  policy_base="$(git merge-base HEAD "$ref" 2>/dev/null || true)"
  [[ -n "$policy_base" ]] && break
done
policy_failed=0
if [[ -n "$policy_base" ]]; then
  for sha in $(git rev-list "$policy_base..HEAD"); do
    # A bot's commit (Dependabot's, for one) carries the message GitHub writes for it, which the format cannot ask it to change, so it is skipped.
    [[ "$(git log -1 --format=%ae "$sha")" == *"[bot]@users.noreply.github.com" ]] && continue
    if ! git log -1 --format=%B "$sha" | bash scripts/validate-commit-message.sh --stdin; then
      echo "  in $(git log -1 --format='%h %s' "$sha")" >&2
      policy_failed=1
    fi
  done
fi
if [[ "$policy_failed" -eq 1 ]]; then
  echo "commit policy failed: see docs/commit-format.md" >&2
  exit 1
fi
echo "commit policy: $( [[ -n "$policy_base" ]] && git rev-list --count "$policy_base..HEAD" || echo 0 ) branch commit(s) checked"

if [[ "$FULL" -eq 1 ]]; then
  step "production build"
  node scripts/run-tests.mjs limited 1800 -- npm run build

  step "unused-file inventory (non-blocking)"
  npm run unused 9>&- || true
fi

if [[ "$FULL" -eq 1 ]] && touches_rust; then
  step "cargo check · test"
  if [[ "$NO_RUST" -eq 1 ]]; then
    # Said out loud rather than skipped quietly: a pass that vanishes without a
    # line of output is indistinguishable from one that never existed.
    echo "· left to the macOS job, which is where wry can build"
  else
    jobs="${MORI_CARGO_JOBS:-2}"
    if ! [[ "$jobs" =~ ^[0-9]+$ ]] || (( jobs < 1 || jobs > 16 )); then
      echo "MORI_CARGO_JOBS=$jobs is not an integer between 1 and 16" >&2
      exit 2
    fi
    MORI_STEP_LABEL="the Rust pass" node scripts/run-tests.mjs limited 3600 -- bash -c \
      "cd src-tauri && cargo check --locked -j $jobs && cargo test --locked -j $jobs -- --test-threads=$jobs"
  fi
elif touches_rust; then
  echo ""
  echo "· src-tauri changed: run scripts/check.sh --full before opening a PR"
fi

echo ""
echo "✓ verification passed"
