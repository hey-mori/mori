# Test-run safety

Mori is developed on a machine it shares with other Claude sessions and
operational services (the NUC, WSL). A test run must never take that machine
down. This document records the incident that made that concrete, the rules
every session and subagent follows, the limits the repository now enforces,
and what those limits do not cover.

## 1. Incident · 2026-10-10

**What happened.** A review subagent wrote a scratch test to
`/tmp/d1abs.test.ts` (18:06:43 KST) and ran:

    vitest run /tmp/d1abs.test.ts --root /

The process ran for about 38 minutes and reached an RSS of about 4.7 GiB. WSL
free memory fell to 247 MiB and swap (4 GiB) was full. SIGTERM did not end it,
so the operator ended it with SIGKILL, after which free memory recovered to
5.4 GiB. The subagent had already been marked stalled (no progress for 600 s),
but the process it started outlived it. An isolated Mori trial app running at
the time also disappeared.

**Direct cause.** The command itself: a Vitest root outside the repository.
Vitest treats a positional argument as a filename *filter*. It first globs its
`include` patterns from `root` and filters afterwards, so `--root /` made it
crawl the whole filesystem (`/proc`, `/mnt/c` over 9P, every `node_modules`).
With `--root /` Vitest also looked for its config in `/`, so the repository's
`vite.config.ts` (projects, excludes, timeouts) never applied.

**What made it worse.**
- Discovery had no bound: nothing limited the crawl to the repository.
- Memory had no cap: no heap limit and no process or cgroup limit.
- Run time had no cap: `testTimeout` and `hookTimeout` apply only once tests
  run, and the crawl never got that far. Nothing wrapped the command in a
  timeout.
- The process outlived its caller: no watchdog tied it to the agent that
  started it.

**Why SIGTERM failed: an inference, not established.** A plausible reading is
that the main thread was busy (a long synchronous crawl, or heavy garbage
collection under memory pressure), so Vitest's graceful shutdown never ran.
This was not measured, and it should not be treated as fact.

**What this is not.** The repository's own gate never runs Vitest with
`--root`, and its test suite was not at fault. The command was the problem.

**A separate improvement.** The normal gate's resource use was also
unbounded. It ran default Vitest workers (8 on this machine), cargo at full
`-j`, and no wall-clock limit. On a shared machine that is a coexistence
problem in its own right, and it is addressed below on the same footing.

## 2. Rules for every session and subagent

These rules are also in `CLAUDE.md`.

1. Run tests only through the repository's entry points: `npm test`,
   `npm run test:unit`, `npm run test:changed`, `scripts/check.sh`, or
   `node scripts/run-tests.mjs vitest <repo path or filter>`. Never call
   `vitest` or `npx vitest` directly.
2. Never pass `--root` or `--dir`, and never point Vitest at a file outside
   the repository (such as `/tmp`). A filename filter does not bound discovery.
3. Put a scratch regression test inside an isolated worktree of this
   repository, under `src/` and named `*.test.ts` (discovery is pinned there),
   run it by its repository path, and delete it afterwards.
4. Review agents are read-only by default. They do not build, run the full
   suite or start heavy processes. The parent agent decides what runs.
5. Only one gate runs at a time on this machine. The gate takes a lock, so a
   second gate fails at once with exit 75: wait for the first one, do not
   stop it.
6. When a test fails or a review agent stalls, check read-only (`ps`) for
   processes it left behind. Never stop a process you did not start. On the
   NUC, report a stuck process to the operator.
7. If verification did not run, report the work as unverified, and say which
   check did not run.

## 3. What the repository enforces

All test scripts go through `scripts/run-tests.mjs`. `scripts/check.sh` calls
the same scripts, so local runs and CI share one definition of "verified": the
same files and assertions, only bounded.

| Limit | Default | Override |
|---|---|---|
| Discovery | `src/**/*.{test,spec}.*` (pinned in `vite.config.ts`, same 409 files as before) | n/a |
| Arguments | an allowlist, normalised as Vitest's parser does (any dashes, `=` values, short clusters such as `-ur=/`); anything else refused (exit 2). Test paths must be under `src/`. `vite.config.ts` also refuses every spelling of `--root`. | n/a |
| Vitest workers | 2, passed as `--maxWorkers` and pinned in `VITEST_MAX_WORKERS` (which outranks the config and the CLI); also the config default for direct calls | `MORI_TEST_MAX_WORKERS` |
| V8 heap per Node process | 2048 MB | `MORI_TEST_HEAP_MB` |
| Wall clock, tests and harness | 900 s, then SIGTERM to the group | `MORI_TEST_TIMEOUT_S` |
| Grace before SIGKILL | 15 s | `MORI_TEST_KILL_GRACE_S` |
| Production build | 1800 s, same group timeout | n/a |
| Rust pass | `cargo -j 2`, `--test-threads=2`, 3600 s | `MORI_CARGO_JOBS` |
| Concurrent test runs | one per machine: `flock` on `/tmp/mori-test-run.lock` (a fixed path, not `$TMPDIR`; released by the kernel if the holder dies), exit 75 | n/a |
| Concurrent gates | one per machine: `flock` on `/tmp/mori-gate.lock`, exit 75 (a directory lock where `flock` is missing, as on macOS) | n/a |

How the wrapper bounds a run:
- **Its own process group.** The run starts detached, in its own process
  group. On timeout, or when the wrapper receives SIGINT, SIGTERM or SIGHUP,
  the whole group gets SIGTERM, then SIGKILL after the grace. That group
  includes Vitest's workers and the smoke tests' bash, python3 and git.
- **Leftovers.** Processes still in the group 2 s after the run ends (time for
  exiting workers to go) are listed and ended. The run's exit code is
  unchanged in that case: the leftovers are reported, not failed.
- **A watchdog outside the group.** A small shell process holds a pipe from
  the wrapper. If the wrapper itself is SIGKILLed (which it cannot catch), the
  pipe closes and the watchdog ends the group. It does the same if a hard
  deadline (limit + grace + 10 s) passes. Before sending SIGKILL it checks
  again that the group still exists.
- **Clear failures.** Exit 124 means a timeout; 137 means the run had to be
  killed after the grace; 75 means another run holds the lock; 2 means the
  arguments were refused. Each prints a `[run-tests] FAILED` or `refused`
  line.
- **Smoke tests.** Their 180 s budgets are unchanged.

`npm run test:safety` (and the gate's "test safeguards" step) proves the limits
without running a single test. It uses sleeps only and takes about 10 s. It
judges by process group, never by scanning the machine, and uses sleep
durations unique to the run. Its 40 checks cover:
- the argument allowlist, including the alias spellings above;
- a run that overstays its limit and has a background child;
- a run that ignores SIGTERM;
- a wrapper SIGKILLed mid-run, with the watchdog cleaning up;
- the run lock.

## 4. Total concurrency

During `npm test` the steps of the gate run one after another, never
together. At most, the following run at once:
- the Vitest main process;
- up to `MORI_TEST_MAX_WORKERS` worker processes, shared across the `unit`
  and `smoke` projects (one pool);
- the short-lived child processes of the smoke test currently running. The
  `smoke` project is serial, and Vitest 4 runs a project with
  `fileParallelism: false` after the others (per the 4.1.6 source, not
  measured here), so smoke tests do not overlap the unit tests;
- the wrapper and its watchdog, which are negligible.

The Rust pass runs alone, with `cargo -j 2` (each rustc can use 1–2 GB) and
2 test threads.

**The heap cap is not a memory cap.** `--max-old-space-size` bounds each
process's JavaScript heap. Native memory (buffers, the compiler, child
processes) comes on top, and there are about 1 + workers Node processes. A
whole-run memory ceiling needs a cgroup (section 6).

**The defaults are candidates, not measurements.** 2 workers and 900 s were
chosen for safety. The last full run took 17 s at the old default of 8 workers,
with the smoke tests skipped on this machine. Where the smoke tests run, the
config's own comment puts them at about 230 s on a loaded machine. Either way
the run is expected to stay well inside 900 s at 2 workers, but that has not
been measured yet: see section 7.

## 5. What this does not cover

- A process that leaves its group on purpose (`setsid`, a daemon) escapes
  group signals. Only a cgroup contains it.
- `npm run test:watch` remains plain, interactive Vitest. It is for a person
  at a terminal, never for an agent. It now inherits the config's 2-worker
  default, which makes watch mode slower; raise `MORI_TEST_MAX_WORKERS` in
  your own shell if you need more.
- Ctrl-C reaches the run (the wrapper forwards it). Ctrl-Z suspends only the
  wrapper; the run keeps going in its own group.
- Typecheck, stylelint and the unused-file inventory have no limits of their
  own. A gate's build or Rust pass can overlap another session's test run,
  because the gate and test locks are separate.
- Anything outside these scripts: a direct `npx vitest ... --root /` without
  this config is refused only by the rules, because Vitest never loads this
  repository's config in that case.
- These limits protect the machine from Mori's tests. They do not isolate
  Mori from the rest of the NUC, and the NUC's overall resource isolation is
  not solved by them.

## 6. systemd and cgroup: findings and proposal (nothing applied)

Read-only findings on the NUC (2026-10-10):
- systemd 259 runs as PID 1 (`/etc/wsl.conf`: `systemd=true`). The system
  manager is `running`. The user manager is `degraded` only because
  `xdg-desktop-portal-gtk` failed, which is unrelated.
- cgroup v2 (`cgroup2fs`), with the controllers cpuset, cpu, io, memory,
  hugetlb, pids and rdma.
- The user manager (`user@1000.service`) has **cpu, memory and pids**
  delegated. **io is not delegated**, so no IO weight is available at user
  level. `memory.swap.max` and `cgroup.kill` exist, and
  `DefaultMemoryAccounting` and `DefaultTasksAccounting` are on.
- `systemd-oomd` is inactive. `user@1000.service` has no limits
  (`memory.max`, `pids.max` = max) and was using about 4.9 GiB for every user
  process together.
- Swap (4 GiB) was fully used at the time of the reading, and memory pressure
  showed recent stalls (`some avg300` 2.2 %).
- Sessions run in per-tmux scopes under
  `user@1000.service/app.slice`. Services outside the user slice are
  untouched by anything done in a user scope.

**Proposal.** Run each test or gate in its own transient user scope, opt-in
through an environment flag, and only after operator approval:

    systemd-run --user --scope --collect --unit=mori-test-$$ \
      -p MemoryMax=3G -p MemorySwapMax=0 -p OOMPolicy=kill \
      -p CPUQuota=200% -p CPUWeight=50 -p TasksMax=512 \
      -- node scripts/run-tests.mjs vitest

What each part does:
- **MemoryMax with MemorySwapMax=0** is a real total memory ceiling for the
  run and everything it spawns, without pushing into the full swap. The kernel
  OOM-kills inside the scope only, and `OOMPolicy=kill` ends the whole scope.
- **CPUQuota=200%** (2 of 8 cores) and a low **CPUWeight** keep the run
  yielding to other sessions.
- **TasksMax** bounds process counts.
- **Cleanup on timeout.** `systemctl --user stop mori-test-…scope`, or writing
  to its `cgroup.kill`, ends every process in the cgroup, including ones that
  `setsid`. The run lock and the wrapper's timeouts stay as they are.
- **Scope of effect.** The scope is transient (`--collect`), needs no root,
  changes no system or WSL settings, and affects nothing outside its own
  processes.
- **Not recommended:** a cap on `user@1000.service` itself, because it would
  squeeze every Claude session at once.

Still to verify before adoption:
- that `RuntimeMaxSec` is honoured for scopes on this systemd;
- that `systemd-run --user` works from every context sessions run in
  (`XDG_RUNTIME_DIR` and the D-Bus session bus must be present);
- the right `MemoryMax`, measured from a real run under the wrapper.

## 7. Verification status of this change

Verified (2026-10-10, without running the test suite):
- `npm run test:safety` passed all 40 checks (after the review fixes), and no
  process or lock was left behind.
- `vite.config.ts` evaluates in plain Node: `include` is pinned to `src/`,
  workers default to 2, and `--root /` throws.
- A static glob shows the pinned `include` selects the same 409 files as
  Vitest's default.

Not yet verified (needs operator approval, stage 2):
- a real Vitest run under the wrapper (duration at 2 workers, peak memory, the
  smoke tests under the group timeout);
- the full gate with the new limits;
- the Rust pass at `-j 2`;
- the cgroup proposal.
