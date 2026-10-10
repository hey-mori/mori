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
5. Only one heavy Mori job runs at a time on this machine: a test run, the
   harness, the gate, or one of the gate's steps. A second one fails at once
   with exit 75 (a standalone `npm test` while a gate runs, too): wait for the
   first one, do not stop it.
6. When a test fails or a review agent stalls, check read-only (`ps`) for
   processes it left behind. Never stop a process you did not start. On the
   NUC, report a stuck process to the operator.
7. If verification did not run, report the work as unverified, and say which
   check did not run.

## 3. What the repository enforces

All test scripts go through `scripts/run-tests.mjs`. `scripts/check.sh` runs
the same command as `npm test` (`node scripts/run-tests.mjs suite`, called
directly for the lock's sake, section 3), so local runs and CI share one
definition of "verified": the same files and assertions, only bounded.

| Limit | Default | Override |
|---|---|---|
| Discovery | `src/**/*.{test,spec}.*`, pinned per project in `vite.config.ts` (unit: every such file but the connector smoke tests; smoke: those 4). Not in the root `test` block: a project that extends it would concatenate both lists, which once made the smoke project run every unit file a second time. | n/a |
| Arguments | an allowlist, normalised as Vitest's parser does (two dashes, `=` values, short clusters such as `-ur=/`; three or more dashes refused); anything else refused (exit 2). Test paths must be under `src/`; `--config` only `vite.config.ts`; `--reporter` only built-in names; `-u` only after the test paths. `vite.config.ts` also refuses every spelling of `--root`. | n/a |
| Vitest workers | 2, passed as `--maxWorkers` and read by `vite.config.ts` (also the default for direct calls). An inherited `VITEST_MAX_WORKERS` is removed: Vitest applies it to every project after the config, which would un-serialise the smoke tests. | `MORI_TEST_MAX_WORKERS` |
| V8 heap per Node process | 2048 MB | `MORI_TEST_HEAP_MB` |
| Wall clock, tests and harness | 900 s, then SIGTERM to the group | `MORI_TEST_TIMEOUT_S` |
| Grace before SIGKILL | 15 s | `MORI_TEST_KILL_GRACE_S` |
| Production build | 1800 s, same group timeout | n/a |
| Rust pass | `cargo -j 2`, `--test-threads=2`, 3600 s | `MORI_CARGO_JOBS` |
| Concurrent heavy jobs | one per machine: a test run, the harness, the gate, the gate's build and Rust pass, and a standalone `limited` step all take `flock` on `/tmp/mori-heavy.lock` (a fixed path, not `$TMPDIR`); a second job gets exit 75 | n/a |
| Leftover processes | a run that exits 0 but leaves live processes in its group fails with exit 70 (the processes are ended) | n/a |
| Process-group observation | every 500 ms, from /proc, by the run's own process group | `MORI_TEST_SAMPLE_MS` (100 to 5000) |

How the wrapper bounds a run:
- **Its own process group.** The run starts detached, in its own process
  group. On timeout, or when the wrapper receives SIGINT, SIGTERM or SIGHUP,
  the whole group gets SIGTERM, then SIGKILL after the grace. That group
  includes Vitest's workers and the smoke tests' bash, python3 and git.
- **Leftovers.** Live processes still in the group once the run has ended
  (after up to the grace, at most 10 s, for exiting workers to go) are listed
  and ended, and a run that exited 0 then fails with exit 70: a test that
  leaves processes behind is a leak, not a clean pass. Zombies do not count.
- **A watchdog outside the group.** A small shell process holds a pipe from
  the wrapper. If the wrapper itself is SIGKILLed (which it cannot catch), the
  pipe closes and the watchdog ends the group. It does the same if a hard
  deadline (limit + grace + 10 s) passes. Before sending SIGKILL it checks
  again that the group still exists.
- **Clear failures.** See the exit-code table below. Each failure prints a
  `[run-tests] FAILED` or `refused` line.
- **Smoke tests.** Their 180 s budgets are unchanged.

`npm run test:safety` (and the gate's "test safeguards" step) proves the limits
without running a single test. It uses sleeps and one 64 MiB allocation, and
uses about 1 s of CPU (measured in a scope). It judges by process
group, never by scanning the machine,
uses sleep durations unique to the run, and uses private lock files, never
the real heavy lock (the gate runs it with fd 9 closed). Its 66 checks (on
Linux with flock; 56 on Linux without it, 55 on macOS) cover:
- the argument allowlist, including the alias spellings above;
- a run that overstays its limit and has a background child;
- a run that ignores SIGTERM;
- a run that exits 0 but leaves a live process behind (exit 70);
- the observation seeing the run's own memory;
- a wrapper SIGKILLed mid-run, with the watchdog cleaning up;
- Ctrl-C (SIGINT) to a wrapper holding a lock: exit 130, nothing left
  running, the lock free again;
- the gate-lock verification: a genuine inherited descriptor is used and the
  gate's lock is still held after the probe; a wrapper reached through npm is
  not covered and fails closed; a run the wrapper starts does not inherit the
  gate's descriptor, and the inner holder does; two jobs inside one gate do
  not overlap (inner lock); a wrong descriptor and a forged descriptor to a
  lock held elsewhere are refused; a second job gets 75; the lock is free
  after release.

### The heavy-job lock: ownership and lifetime

One lock, `/tmp/mori-heavy.lock`, covers every heavy Mori job on the machine.

- **Outside a gate**, the wrapper takes the lock itself, first and afresh. A
  `flock` holder process keeps it, in its own process group. The wrapper tells
  it the run's process group and says "done" when the run has ended. If the
  wrapper dies instead (its pipe closes), the holder keeps the lock until that
  group is gone (at most grace + 30 s), so a new job never overlaps a run that
  is still being ended. The kernel releases the lock when the holder ends.
  The holder's script always runs under bash by absolute path, whatever
  `$SHELL` is.
- **The gate** (`scripts/check.sh`) locks the file on fd 9 for its whole life
  and exports `MORI_HEAVY_LOCK_FD=9`. It finds flock the same way the
  wrappers do (absolute system paths only), so both always agree on whether
  there is a lock at all.
- **Node passes no extra descriptors to its children** (measured on Node 24:
  a child gets only its stdio). Only a wrapper the gate's shell starts
  directly with `node` has fd 9, so the gate runs
  `node scripts/run-tests.mjs suite`, the same command as `npm test`, rather
  than `npm test` itself. Reached through npm, a wrapper inside the gate is
  not covered and fails with 75: closed, never open.
- **Inside the gate**, a wrapper first tries to take the lock afresh, which
  fails because the gate holds it. Only then does it consider the gate's
  descriptor, and it does not trust the variable. It checks that fd 9 is this
  lock file (same device and inode), and that a non-blocking `flock` on that
  very inherited descriptor succeeds. flock locks belong to the open file
  description, and the lock is held, so this succeeds only if the gate's
  description is the holder. Otherwise the wrapper fails with exit 75.
  Covered jobs then take a private inner lock (`/tmp/mori-heavy.lock.inner`),
  so two jobs inside the same gate do not overlap each other either. A stray
  or forged variable cannot let a job outside the gate overlap it. In a tiny
  window, where the holder lets go between the two steps, the probe could take
  the free lock on the inherited description. Exclusion still holds, but the
  lock then stays with whoever owns that description. Inside a gate that is
  the gate. Outside one it takes a deliberate forgery (a shell that opens the
  lock file on fd 9 and sets the variable), and that shell, the covered
  wrapper and its inner holder then keep the lock until they have all exited,
  so every later job fails with 75 until then.
- **Lifetime.** The lock lives as long as the job: the gate's ends when the
  gate, the wrappers it started and their inner-lock holders have exited.
  Runs and watchdogs never get the descriptor (see above), and the gate runs
  its shell steps and the self-check with `9>&-`. The one exception is
  deliberate: the inner holder is handed the gate's descriptor explicitly and
  keeps it while it holds the inner lock, so if the gate ends (for
  example because a wrapper inside it was killed) while a run is still being
  ended, the gate's lock lasts until that holder lets go. If something else
  still ends up holding it, later jobs fail with 75 rather than overlapping it.
  That is safe, but someone has to look: `fuser /tmp/mori-heavy.lock` shows
  the holder, read-only.
- **Without flock** (stock macOS, native Windows) there is no machine-wide
  lock: runs are bounded but not kept apart, and the wrapper and the gate say
  so. Those are personal machines, not shared ones. (An earlier directory-lock
  fallback was removed: it could not be verified here and had races of its
  own.)
- **Transitional.** Exclusion holds only among runs of this code. Worktrees on
  older branches use no lock or older lock names, which do not exclude this
  one.
- **What is not locked.** Nobody resolves a conflict by deleting the lock
  file or stopping another job. A second job waits for nothing: it fails at
  once with exit 75.

### Observing a run

The wrapper reads its run's process group from `/proc` every
`MORI_TEST_SAMPLE_MS` (default 500 ms). It identifies the group by the pid it
spawned, never by matching command lines. Each sample costs one listing of
`/proc` and one small read for every process on the machine (about 100 on
the NUC); there is no filesystem walk. After
each run it prints:
- the exit code and duration;
- whether the run timed out, whether SIGKILL was needed, and whether
  leftovers had to be ended;
- the group's peak RSS sum, the largest single process, and the most
  processes at once;
- the number of samples and failed samples;
- the number of zombies (exited, not yet reaped) left in the group, which
  are never counted as leftovers on Linux. Without `/proc` (macOS) the
  fallback check cannot tell a zombie apart, so a zombie there can fail a
  passing run with 70; that errs toward failure.

`MORI_TEST_REPORT_FILE` writes the same report as JSON. It must be a regular
file directly in `/tmp`: it is opened without following symlinks and without
blocking, and refused if it is a FIFO, a device or has other hard links. It
is never written in the repository. `npm test` writes both of its runs
(Vitest, then the harness) to it.

What those numbers are not:
- **An RSS sum is not memory use.** Pages shared between processes
  (libraries, copy-on-write) are counted once per process, and pages swapped
  out are not counted at all (which matters while swap is full).
- **A sampled peak can miss spikes** between two samples. With the double
  counting and the swapped pages above, the figure is neither an upper nor a
  lower bound of real use.
- **Processes that left the group are invisible.** Anything started with
  `setsid` or as a daemon is not seen.
- **This is not a cgroup's `memory.peak`.** That counts page cache and is
  exact; only a cgroup gives a real whole-run figure.

A failed sample is counted and never changes the run's result.

### Exit codes

| Code | Meaning |
|---|---|
| as reported by the run | the run finished on its own |
| 128 + n | the run itself was killed by signal n. An out-of-memory kill gives 137, like a timeout kill: without a scope, the report's "timed out" field tells them apart; in a scope (`OOMPolicy=kill`) the wrapper dies too, and `scripts/scoped.sh` says the scope ended by a signal before its summary |
| 1 | the wrapper failed, or could not start the command |
| 124 | timed out and ended by SIGTERM |
| 137 | timed out and needed SIGKILL |
| 130 / 143 / 129 | stopped by SIGINT / SIGTERM / SIGHUP sent to the wrapper |
| 70 | exited 0 but left live processes in its group (ended, then failed) |
| 75 | another heavy job holds the lock |
| 2 | arguments refused |

Zombie processes (exited, not yet reaped) hold no memory and are not counted
as leftovers. Only live members of the run's own process group are ever
signalled, so nothing unrelated can be targeted.

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
processes) comes on top, and there are about 1 + workers Node processes. The
2048 MB default is a guard against one runaway process, not a figure anyone
has shown to be safe for the machine. Whole-run memory protection is the
scope's `MemoryMax` (`scripts/scoped.sh`, section 6).

**The defaults were chosen for safety and then measured.** A full Vitest run
at 2 workers takes well under the 900 s limit on the NUC (section 7), with
the smoke tests skipped on this machine. Where the smoke tests run, the
config's own comment puts them at about 230 s on a loaded machine.

## 5. What this does not cover

- A process that leaves its group on purpose (`setsid`, a daemon) escapes
  group signals. Only a scope (`scripts/scoped.sh`) contains it.
- `npm run test:watch` remains plain, interactive Vitest. It is for a person
  at a terminal, never for an agent. It now inherits the config's 2-worker
  default, which makes watch mode slower; raise `MORI_TEST_MAX_WORKERS` in
  your own shell if you need more.
- Ctrl-C reaches the run (the wrapper forwards it). Ctrl-Z suspends only the
  wrapper; the run keeps going in its own group, and the lock stays held for
  as long as the wrapper stays suspended.
- If the holder's bash script is killed while the wrapper lives, the lock is
  lost without notice for the rest of that run. (Killing only its `flock`
  parent does not release it: the bash child keeps the lock descriptor.) If
  the wrapper and its watchdog die together, the holder lets go after
  grace + 30 s even if the run continues.
  Both need a kill from outside; a scope keeps such a run inside its limits.
- Between a group emptying and the next signal to it, its pgid could in
  theory be reused by an unrelated process. That needs the pid counter to wrap
  around within seconds; it is not handled.
- The self-check has no wall-clock limit of its own; its drills bound each
  wait, and a drill subprocess that overstays 60 s is killed, though its own
  children are then left to end by themselves (they hold only a private
  lock). It runs while the gate holds the machine lock.
- `npm run check:release` runs `npm test` under the lock but its
  `npm run build` without it (the gate's build is locked).
- `limited` exists for the gate's own build and Rust steps. It checks the
  command's shape (`npm run build`, or `bash -c "cd src-tauri && cargo ..."`),
  not everything after `cargo`; it bounds a step, it is not a sandbox.
- Ceilings are per scope, not shared. Two scopes could together exceed what
  the machine has; the heavy-job lock and `scoped.sh`'s free-memory check are
  what keep that from happening.
- Windows: the process-group drills are skipped and a timeout ends the tree
  with `taskkill`; there is no watchdog there.
- `limited` runs only the gate's own steps (`npm run build` and the Rust pass's
  `cd src-tauri && cargo ...`) under the heavy-job lock; it applies no heap
  cap.
- On Windows the shell joins arguments unquoted, so a test name with spaces
  breaks there.
- Typecheck, stylelint and the unused-file inventory have no time or memory
  limits of their own (they run inside the gate's lock).
- Anything outside these scripts: a direct `npx vitest ... --root /` without
  this config is refused only by the rules, because Vitest never loads this
  repository's config in that case.
- These limits protect the machine from Mori's tests. They do not isolate
  Mori from the rest of the NUC, and the NUC's overall resource isolation is
  not solved by them.

## 6. systemd and cgroup: findings and the scoped runner

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
- Swap (4 GiB) was nearly full at every reading on 2026-10-10 (4051-4052 MiB
  used). At the same readings, available RAM was 5.2-5.5 GiB and memory
  pressure was 0.00 (`some` avg10, avg60 and avg300), apart from one earlier
  reading right after the incident (`some avg300` 2.2 %). A full swap alone
  does not mean memory is short now; it does mean there is no swap headroom
  left if a spike comes.
- Sessions run in per-tmux scopes under
  `user@1000.service/app.slice`. Services outside the user slice are
  untouched by anything done in a user scope.

**Adopted, opt-in: `scripts/scoped.sh`.** It runs one heavy command in its
own transient user scope:

    scripts/scoped.sh npm test
    scripts/scoped.sh scripts/check.sh --full

which amounts to

    systemd-run --user --scope --collect --slice=mori.slice \
      --unit=mori-job-<time>-<pid> \
      -p MemoryMax=3G -p MemorySwapMax=0 -p CPUQuota=200% -p TasksMax=256 \
      -p OOMPolicy=kill -p TimeoutStopSec=15 -- <command>

What each part does:
- **MemoryMax with MemorySwapMax=0** is a real total memory ceiling for the
  run and everything it spawns, without pushing into the full swap. The kernel
  OOM-kills inside the scope only, and `OOMPolicy=kill` ends the whole scope.
- **CPUQuota=200%** (2 of 8 cores) keeps the run yielding to other sessions.
  **TasksMax** bounds process counts.
- **Its own slice.** `mori.slice` sits directly under the user manager, so
  enabling the cpu controller for the scope touches only that slice, never
  `app.slice`, where the sessions run. A dash in a slice name nests it
  (`mori-heavy.slice` lands under `mori.slice`), hence the plain name.
- **Enough memory first.** It starts only with at least the memory ceiling
  plus 1 GiB available (`MemAvailable`); otherwise it exits 75 without
  starting anything: try later, stop nothing.
- **Verified from inside before the command starts.** The script checks that
  it runs in exactly `mori.slice/<unit>.scope` and reads back `memory.max`,
  `memory.swap.max`, `cpu.max`, `pids.max` and `memory.oom.group`. Any mismatch, or a scope that
  could not be made, means the command does not run (exit 3): never an
  unrestricted heavy run.
- **Measured from inside at the end.** It prints the scope's `memory.peak`
  (exact for the whole run, page cache included), `memory.swap.peak`, how
  often `memory.max` was reached, `pids.peak`, `oom_kill` and CPU time, which
  the sampling cannot give. If an out-of-memory kill ends the whole scope,
  that summary cannot print; the script then says the scope ended by a
  signal before its summary.
- **Leftovers.** Processes still in the scope after the command (a `setsid`
  daemon included) are stopped with `systemctl --user stop <that unit>`: only
  that exact scope, never anything else. A command that exited 0 then fails
  with 70.
- **Containment does not depend on the script.** If the script dies, the
  scope keeps its limits until its last process ends.
- **Knobs:** `MORI_SCOPE_MEMORY_GB` (1-4, default 3), `MORI_SCOPE_CPU_PCT`
  (50-400, default 200), `MORI_SCOPE_TASKS` (64-512, default 256). Never raise
  them to get a failing run through. If a cold Rust build needs more, first
  lower its parallelism (`MORI_CARGO_JOBS=1`); 4 GiB is a deliberate choice
  for a machine with enough memory free, recorded with the evidence, never a
  retry after an out-of-memory kill.
- **Scope of effect.** Transient (`--collect`), no root, no system or WSL
  setting, no persistent unit, nothing outside its own processes.
- **Not done:** a cap on `user@1000.service` or the whole user slice, because
  it would squeeze every Claude session at once.

The repository's own limits (workers, heap, wall clock, process group,
watchdog, heavy-job lock) stay in force inside the scope. They also cover
macOS and machines without a systemd user manager, where `scoped.sh`
refuses to run.

## 7. Verification status of this change

Measured on the NUC on 2026-10-10 (Node 24.20, Vitest 4.1.6, cargo 1.98.1).
Logs are kept outside the repository with the operator's evidence.

- **Self-check:** 66 of 66 checks passed, inside a scope. Its first run on
  an earlier version failed one check (60 of 61), and that failure found a
  real defect: Node passes no extra descriptors to its children, so the
  gate's `npm test` step could never have used the gate's lock and would have
  failed with 75. The gate now calls the wrapper directly (section 3).
- **The heavy-job lock, real lock file, harmless processes:** with an idle
  holder on `/tmp/mori-heavy.lock`, a standalone wrapper failed with 75 in
  139 ms, the gate in 6 ms and `npm test` in 174 ms, and none of them started
  a test. A wrapper started by a stand-in gate (the gate's own lock preamble)
  ran under the gate's lock. A wrapper SIGKILLed while its run ignored SIGTERM
  (grace 3 s): the run's group stayed alive about 3 s, the lock stayed held
  throughout, and it was free about 56 ms after the group was gone.
- **Observation:** on 30 test files (227 tests, 2.4 s) an independent `/proc`
  sampler found the same process group as the wrapper reported and the same
  peak of 4 processes (Vitest, esbuild and 2 workers; 20 worker processes over
  the run). The RSS sums were 324 and 338 MiB (different sample instants)
  while the scope's exact `memory.peak` was 210 MiB: the sum over-counts, as
  section 3 says.
- **Worker cap:** at most 2 workers at once over those 30 files.
- **Full gate (`scripts/check.sh --full --no-rust`), in a scope, at the
  last code commit:** every pass ran and passed: typecheck, the self-check, the
  tests (405 files passed and 4 skipped, 4056 tests passed and 7 skipped; the
  skips are the environment-gated live and smoke tests; Vitest 31 s), the
  harness, stylelint, prose, commit guards, the production build and the
  unused-file inventory. Scope `memory.peak` 1023 MiB, the limit never
  reached, 55 tasks at most, no OOM kill, no swap.
- **The Rust pass** ran inside the earlier full gate (one commit set before
  the last review fixes, which do not touch it): `cargo check` and
  `cargo test` at `-j 2`, 389 and 4 tests passed and 5 ignored, on a warm
  build cache. That gate's scope reached its 3 GiB ceiling (page cache: a warm
  cargo build reads its large target directory) with no OOM kill and no swap.
- **The review found the suite running twice:** a root `include` was
  concatenated into the smoke project, so every unit file also ran there
  (814 files where 409 exist, 8105 tests where 4056 exist). Fixed; the
  numbers above are after the fix.
- **Mistakes during verification, recorded:** `--version` was let through and
  under `vitest run` it ran the whole suite once, bounded by the wrapper but
  outside a scope (70 s, RSS sum peak 576 MiB). It is now refused.

Not verified:
- a cold Rust build inside the 3 GiB scope;
- macOS and Windows behaviour (no machine was available);
- an OOM kill inside a scope (deliberately not provoked).
