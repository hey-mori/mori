#!/usr/bin/env bash
#
# Run one heavy Mori command (the full test suite, the gate) inside a
# transient systemd user scope, so the whole run, every process it starts
# included, has a real memory, swap, CPU and task ceiling. The scope's limits
# are checked from inside it before the command starts: if they are not in
# force, the command never runs. Linux with a systemd user manager only. See
# docs/test-run-safety.md §6.
#
#   scripts/scoped.sh npm test
#   scripts/scoped.sh scripts/check.sh --full
#
# Knobs (validated; the defaults are the shared-machine budget):
#   MORI_SCOPE_MEMORY_GB  1-4, default 3      MemoryMax (swap is always 0)
#   MORI_SCOPE_CPU_PCT    50-400, default 200 CPUQuota
#   MORI_SCOPE_TASKS      64-512, default 256 TasksMax
#
# Exit codes: the command's own; 2 bad usage; 3 the scope could not be made or
# its limits were not in force (the command did not run); 70 the command
# exited 0 but left processes in the scope (that scope is then stopped).
set -euo pipefail

within() { # name value min max
  if [[ ! "$2" =~ ^[0-9]+$ ]] || (( $2 < $3 || $2 > $4 )); then
    echo "scoped: $1 must be an integer from $3 to $4" >&2
    exit 2
  fi
}
mem_gb="${MORI_SCOPE_MEMORY_GB:-3}"
cpu_pct="${MORI_SCOPE_CPU_PCT:-200}"
tasks="${MORI_SCOPE_TASKS:-256}"
within MORI_SCOPE_MEMORY_GB "$mem_gb" 1 4
within MORI_SCOPE_CPU_PCT "$cpu_pct" 50 400
within MORI_SCOPE_TASKS "$tasks" 64 512
if (( $# == 0 )); then
  echo "usage: scripts/scoped.sh <command> [args]" >&2
  exit 2
fi
if ! command -v systemd-run >/dev/null 2>&1 || [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
  echo "scoped: no systemd user manager here; refusing to run unrestricted" >&2
  exit 3
fi

unit="mori-job-$(date +%Y%m%d-%H%M%S)-$$"
marker="$(mktemp "$XDG_RUNTIME_DIR/mori-scoped.XXXXXX")"
trap 'rm -f "$marker"' EXIT
export MORI_SCOPE_UNIT="$unit" MORI_SCOPE_MARKER="$marker"
export MORI_SCOPE_EXPECT_MEM=$(( mem_gb * 1073741824 ))
export MORI_SCOPE_EXPECT_CPU="$(( cpu_pct * 1000 )) 100000"
export MORI_SCOPE_EXPECT_TASKS="$tasks"

# Runs inside the scope: verify, mark, run the command as a child, then read
# the scope's own counters before it goes away.
inner='
cg=$(sed -n "s/^0:://p" /proc/self/cgroup)
d=/sys/fs/cgroup$cg
refuse() { echo "scoped: $1; the command was not run" >&2; exit 3; }
[[ "$cg" == */mori.slice/"$MORI_SCOPE_UNIT".scope ]] || refuse "not in the expected scope ($cg)"
[[ "$(cat "$d/memory.max" 2>/dev/null)" == "$MORI_SCOPE_EXPECT_MEM" ]] || refuse "memory.max is not in force"
[[ "$(cat "$d/memory.swap.max" 2>/dev/null)" == 0 ]] || refuse "memory.swap.max is not in force"
[[ "$(cat "$d/cpu.max" 2>/dev/null)" == "$MORI_SCOPE_EXPECT_CPU" ]] || refuse "cpu.max is not in force"
[[ "$(cat "$d/pids.max" 2>/dev/null)" == "$MORI_SCOPE_EXPECT_TASKS" ]] || refuse "pids.max is not in force"
echo started > "$MORI_SCOPE_MARKER"
echo "[scoped] $MORI_SCOPE_UNIT: memory.max $(( MORI_SCOPE_EXPECT_MEM / 1048576 )) MiB, swap 0, cpu.max $MORI_SCOPE_EXPECT_CPU, pids.max $MORI_SCOPE_EXPECT_TASKS" >&2
code=0
"$@" || code=$?
oom=$(sed -n "s/^oom_kill //p" "$d/memory.events")
cpu=$(sed -n "s/^usage_usec //p" "$d/cpu.stat")
echo "[scoped] $MORI_SCOPE_UNIT: exit $code · memory.peak $(( $(cat "$d/memory.peak") / 1048576 )) MiB (page cache included) · swap.peak $(( $(cat "$d/memory.swap.peak") / 1048576 )) MiB · pids.peak $(cat "$d/pids.peak") · oom_kill ${oom:-0} · cpu $(( ${cpu:-0} / 1000000 )) s" >&2
exit "$code"
'

code=0
systemd-run --user --scope --quiet --collect --slice=mori.slice --unit="$unit" \
  -p MemoryMax="${mem_gb}G" -p MemorySwapMax=0 -p CPUQuota="${cpu_pct}%" \
  -p TasksMax="$tasks" -p OOMPolicy=kill -p TimeoutStopSec=15 \
  -- /bin/bash -c "$inner" scoped "$@" || code=$?

if [[ ! -s "$marker" ]]; then
  echo "scoped: the scope $unit was not created or not verified (exit $code); the command did not run" >&2
  exit 3
fi

# Anything still in this scope outlived the command. Only this exact scope is
# looked at and stopped, never anything else.
cg="$(systemctl --user show -p ControlGroup --value "$unit.scope" 2>/dev/null || true)"
left=""
if [[ "$cg" == */mori.slice/"$unit".scope ]]; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    left="$(tr '\n' ' ' < "/sys/fs/cgroup$cg/cgroup.procs" 2>/dev/null || true)"
    [[ -z "${left// /}" ]] && { left=""; break; }
    sleep 0.5
  done
fi
if [[ -n "$left" ]]; then
  echo "[scoped] processes still in $unit.scope after the command ended (pids $left): stopping that scope" >&2
  systemctl --user stop "$unit.scope" || true
  (( code == 0 )) && code=70
fi
exit "$code"
