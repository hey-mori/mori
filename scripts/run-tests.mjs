#!/usr/bin/env node
/**
 * The repository's test entry point, with resource limits.
 *
 * Mori is developed on a machine shared with other sessions and services, so a
 * test run must never be able to take the machine down. This wrapper is what
 * `npm test`, `scripts/check.sh` and the other test scripts call. It keeps the
 * meaning of the suite unchanged (the same files, the same assertions) and
 * bounds how it runs. Reasons and limits: docs/test-run-safety.md.
 *
 * - Arguments pass an allowlist. Vitest's parser accepts many spellings
 *   (`--root`, `-r`, `--r=`, a short cluster like `-ur=`), so instead of
 *   refusing known bad flags, only known safe ones are let through, after
 *   normalising the way Vitest does. A test path must be inside `src/`; a
 *   bare filter word narrows within the pinned discovery and never widens it.
 *   `vite.config.ts` also pins `include` to `src/` and refuses `--root`.
 * - Workers are capped (`MORI_TEST_MAX_WORKERS`, default 2): passed as
 *   `--maxWorkers` and read by `vite.config.ts`. `VITEST_MAX_WORKERS` is
 *   removed from the child's environment: Vitest lets it override every
 *   project's worker count, which would un-serialise the smoke tests.
 * - Each Node process gets a V8 heap cap (`MORI_TEST_HEAP_MB`, default 2048).
 *   That bounds the JavaScript heap of each process, not a process's total
 *   memory and not the run's total. A whole-run memory cap needs a cgroup.
 * - A wall-clock limit (`MORI_TEST_TIMEOUT_S`, default 900 s) ends the run with
 *   SIGTERM to its whole process group, then SIGKILL after a grace period
 *   (`MORI_TEST_KILL_GRACE_S`, default 15 s). Exit 124, or 137 if it had to be
 *   killed.
 * - The run gets its own process group, so what it spawns (Vitest workers, the
 *   smoke tests' bash, python3 and git) is signalled with it. Signals sent to
 *   this wrapper are forwarded the same way. Live processes still in the group
 *   when the run ends are reported and ended, and the run then fails (exit 70)
 *   even if its own exit code was 0. A process that leaves the group on
 *   purpose (setsid, a daemon) is beyond this: only a cgroup contains it.
 * - A watchdog outside the group holds a pipe from this wrapper. If the
 *   wrapper dies (SIGKILL cannot be caught) the pipe closes and the watchdog
 *   ends the group; it also enforces a hard deadline (limit + grace + 10 s).
 * - One heavy Mori job at a time on this machine: tests, the harness, the
 *   gate, the gate's build and Rust pass, and a standalone limited step all
 *   take the same lock (`flock` on /tmp/mori-heavy.lock). A wrapper running
 *   inside the gate uses the gate's lock, after verifying it really holds it
 *   (see coveredByGate). A second job fails at once with exit 75.
 * - The run's process group is observed from /proc (never by matching command
 *   lines): peak RSS sum, largest process, process count. These are sampled
 *   observations with stated limits, not a memory peak (see observeGroup).
 *
 * Usage:
 *   node scripts/run-tests.mjs suite                       npm test: Vitest, then
 *                                                          the harness, one job
 *   node scripts/run-tests.mjs vitest [args]               the Vitest suite
 *   node scripts/run-tests.mjs harness                     the node:test harness
 *   node scripts/run-tests.mjs self-check                  proves the limits,
 *                                                          with sleeps, no tests
 *   node scripts/run-tests.mjs limited <secs> -- <cmd...>  the gate's build or
 *                                                          Rust pass under the
 *                                                          same group limit
 */
import { spawn, spawnSync } from "node:child_process";
import { constants as osConstants, tmpdir } from "node:os";
import {
  accessSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  ftruncateSync,
  openSync,
  realpathSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const POSIX = process.platform !== "win32";
const LINUX = process.platform === "linux";
// A fixed path, not $TMPDIR and not configurable: the lock must be the same
// for every session and worktree on the machine, whatever its environment says.
export const HEAVY_LOCK = POSIX ? "/tmp/mori-heavy.lock" : join(tmpdir(), "mori-heavy.lock");

export const EXIT_TIMEOUT = 124;
export const EXIT_KILLED = 137;
export const EXIT_LOCKED = 75;
export const EXIT_LEFTOVER = 70;
export const EXIT_REFUSED = 2;

function envInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}=${raw} is not an integer between ${min} and ${max}`);
  }
  return value;
}

export function limits() {
  return {
    maxWorkers: envInt("MORI_TEST_MAX_WORKERS", 2, 1, 16),
    heapMb: envInt("MORI_TEST_HEAP_MB", 2048, 256, 16384),
    timeoutS: envInt("MORI_TEST_TIMEOUT_S", 900, 1, 6 * 3600),
    graceS: envInt("MORI_TEST_KILL_GRACE_S", 15, 1, 300),
    sampleMs: envInt("MORI_TEST_SAMPLE_MS", 500, 100, 5000),
  };
}

function insideRepo(path) {
  const rel = relative(REPO, resolve(REPO, path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── Argument allowlist ──────────────────────────────────────────────────────

/** Long options let through, by camelCase name, and what value each takes. */
const ALLOWED_LONG = new Map([
  ["changed", "optional"],
  ["project", "value"],
  ["testNamePattern", "value"],
  ["reporter", "reporter"],
  ["outputFile", "path"],
  ["bail", "optional"],
  ["passWithNoTests", "flag"],
  ["silent", "optional"],
  ["update", "update"],
  ["shard", "value"],
  ["retry", "value"],
  ["allowOnly", "flag"],
  ["hideSkippedTests", "flag"],
  ["logHeapUsage", "flag"],
  ["expandSnapshotDiff", "flag"],
  ["testTimeout", "value"],
  ["hookTimeout", "value"],
  ["config", "config"],
]);
/** Short options let through (Vitest's own aliases for the above). */
const ALLOWED_SHORT = new Map([
  ["t", "testNamePattern"],
  ["u", "update"],
  ["c", "config"],
]);
/** Words Vitest reads as a mode, not a filter. Only `run` is a bounded one. */
const MODE_WORDS = new Set(["watch", "dev", "related", "bench", "list", "init", "typecheck"]);
/** Reporters built into Vitest 4.1.6; a reporter can otherwise be any module. */
const BUILT_IN_REPORTERS = new Set([
  "default",
  "verbose",
  "minimal",
  "agent",
  "dot",
  "json",
  "junit",
  "tap",
  "tap-flat",
  "hanging-process",
  "github-actions",
  "tree",
]);

const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const underSrc = (path) => {
  const rel = relative(REPO, resolve(REPO, path)).split("\\").join("/");
  return rel === "src" || rel.startsWith("src/");
};

/**
 * Why these Vitest arguments are refused, or null when they are fine. Pure, so
 * the self-check can prove each rule without starting Vitest.
 */
export function refuseVitestArgs(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") return "`--` is not allowed: every argument goes through the allowlist";
    if (!arg.startsWith("-")) {
      if (index === 0 && arg === "run") continue;
      if (MODE_WORDS.has(arg)) return `${arg} is not a bounded mode; only run is`;
      if (isAbsolute(arg) || !insideRepo(arg)) return `test path ${arg} is outside the repository`;
      // A path-like filter must point into src/, where discovery is pinned;
      // anything else finds nothing and invites widening the root.
      const looksLikePath = arg.includes("/") || /\.(test|spec)\./.test(arg);
      if (looksLikePath && !underSrc(arg)) return `test path ${arg} is outside src/, where tests are discovered`;
      continue;
    }
    // Normalise as Vitest's parser does: two dashes for a long option, `=`
    // values, and a single-dash cluster of short flags (the value goes to the
    // last). Three or more dashes parse as a cluster there; refuse them here.
    if (arg.startsWith("---")) return `${arg}: use one or two dashes`;
    const doubleDash = arg.startsWith("--");
    const body = arg.replace(/^-+/, "");
    const equals = body.indexOf("=");
    const head = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1);
    const names = !doubleDash && head.length > 1 ? [...head] : [head];
    for (let n = 0; n < names.length; n += 1) {
      const raw = names[n];
      const isLast = n === names.length - 1;
      const negated = raw.length > 1 && raw.startsWith("no-");
      const long = raw.length === 1 ? ALLOWED_SHORT.get(raw) : camel(negated ? raw.slice(3) : raw);
      const kind = long ? ALLOWED_LONG.get(long) : undefined;
      if (!long || !kind) return `${arg} is not an allowed option (see docs/test-run-safety.md)`;
      // `--no-x` is a plain off switch: never with an option that takes a value.
      if (negated && kind !== "flag" && kind !== "optional") return `${arg}: only a flag can be negated`;
      // Vitest never takes a value after `--no-x`; neither does this check.
      if (negated) continue;
      if (!isLast && kind !== "flag") return `${arg}: ${raw} takes a value and cannot sit inside a cluster`;
      if (!isLast || kind === "flag") continue;
      const next = index + 1 < args.length && !args[index + 1].startsWith("-") ? args[index + 1] : undefined;
      if (kind === "update" && inlineValue !== undefined && !["all", "new", "none"].includes(inlineValue)) {
        return `${arg}: the update type is all, new or none`;
      }
      if (kind === "update") {
        // Vitest's `--update [type]` takes the next word as its value, which
        // would turn a test path into an update type and update every snapshot.
        if (inlineValue === undefined && next !== undefined) return `${arg}: put it after the test paths, not before one`;
        continue;
      }
      let value = inlineValue;
      // Like Vitest's parser, an option with a value (required or optional)
      // takes the next word when none is given inline.
      if (value === undefined && next !== undefined) {
        value = next;
        index += 1;
      }
      if ((kind === "value" || kind === "path" || kind === "config" || kind === "reporter") && value === undefined) {
        return `${arg} needs a value`;
      }
      if (kind === "path" && (isAbsolute(value) || !insideRepo(value))) return `${arg}: ${value} is outside the repository`;
      if (kind === "config" && relative(REPO, resolve(REPO, value)) !== "vite.config.ts") {
        return `${arg}: the only config is vite.config.ts`;
      }
      if (kind === "reporter" && !BUILT_IN_REPORTERS.has(value)) return `${arg}: only Vitest's built-in reporters are allowed`;
    }
  }
  return null;
}

// ── The heavy-job lock ──────────────────────────────────────────────────────

/** A system tool by absolute path, so nothing earlier on PATH (npm puts
 *  node_modules/.bin first) can stand in for it. Executable files only, the
 *  same test as scripts/check.sh's `-x`. */
function sysBin(name) {
  for (const dir of ["/usr/bin", "/bin", "/usr/local/bin"]) {
    try {
      accessSync(join(dir, name), fsConstants.X_OK);
      return join(dir, name);
    } catch {
      /* try the next */
    }
  }
  return null;
}
const FLOCK = POSIX ? sysBin("flock") : null;
// The holder and watchdog scripts need bash ($SECONDS, `read -t`), whatever
// $SHELL is: flock's `-c` form would run them under $SHELL or /bin/sh.
const BASH = POSIX ? sysBin("bash") : null;

/** A stdio array that also hands the child process `fd` at the same number. */
function stdioSharing(fd, base = ["ignore", "ignore", "ignore"]) {
  const stdio = [...base];
  while (stdio.length < fd) stdio.push("ignore");
  stdio[fd] = fd;
  return stdio;
}

/** The inherited descriptor MORI_HEAVY_LOCK_FD names, if it is `path` itself. */
export function inheritedLockFd(path, env = process.env) {
  const raw = env.MORI_HEAVY_LOCK_FD;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const fd = Number(raw);
  // 3-9 only: the gate uses 9.
  if (fd < 3 || fd > 9) return null;
  try {
    const held = fstatSync(fd);
    const file = statSync(path);
    return held.dev === file.dev && held.ino === file.ino ? fd : null;
  } catch {
    return null;
  }
}

/**
 * Whether this process runs inside a gate that holds `path`, verified rather
 * than taken on trust. Asked only after taking the lock afresh failed, that
 * is while someone holds it. The gate (scripts/check.sh) locks the file on a
 * descriptor its children inherit and names it in MORI_HEAVY_LOCK_FD, which
 * is only a hint. Only a process the gate's shell starts directly has that
 * descriptor: Node passes no extra descriptors to its children, so npm (and
 * this wrapper's own runs) never do, and the gate calls `node` directly. Two checks decide:
 * - the descriptor must be the lock file itself (same device and inode);
 * - a non-blocking `flock` on that inherited descriptor must succeed. flock
 *   locks belong to the open file description, and the lock is held, so this
 *   succeeds only if this very description is the holder.
 * Exclusivity stays the kernel's: a wrong or forged variable cannot let a job
 * outside the gate overlap it.
 */
export function coveredByGate(path, env = process.env) {
  if (FLOCK) {
    const fd = inheritedLockFd(path, env);
    if (fd === null) return { ok: false, reason: "no inherited descriptor of the lock file" };
    // The descriptor form (`flock -n <fd>`, no command): it locks the shared
    // description and exits; the lock stays with the description.
    const probe = spawnSync(FLOCK, ["-n", String(fd)], { stdio: stdioSharing(fd) });
    if (probe.status !== 0) return { ok: false, reason: `${path} is held by another process` };
    return { ok: true, fd, how: `descriptor ${fd} verified` };
  }
  return { ok: false, reason: "no flock on this machine" };
}

/**
 * The heavy-job lock. Taken afresh when free. When it is held, a job inside
 * the gate that holds it (verified, see coveredByGate) runs under the gate's
 * lock instead, and takes a private inner lock so two such jobs never
 * overlap each other either. Anything else fails: exit 75. Without flock
 * (native Windows, stock macOS) there is no machine-wide lock: runs there are
 * bounded but not kept apart, and say so. Those are not shared machines.
 */
export async function acquireHeavyLock(path = HEAVY_LOCK, env = process.env, holdS = 60) {
  if (!FLOCK) {
    const unlocked = POSIX ? "no flock here, so no machine-wide lock" : "no machine-wide lock on Windows";
    return { ok: true, path, unlocked, adopt: () => {}, release: async () => {} };
  }
  const own = await acquireLockAt(path, holdS);
  if (own.ok) return own;
  const covered = coveredByGate(path, env);
  if (!covered.ok) return own;
  // The inner holder is handed the gate's descriptor too, so if the gate and
  // this wrapper end while the run is still being ended, the gate's lock
  // lasts until the holder lets go.
  const inner = await acquireLockAt(`${path}.inner`, holdS, covered.fd ?? null);
  if (!inner.ok) return { ok: false, path: `${path}.inner` };
  return { ...inner, covered: covered.how };
}

/**
 * Hold a lock file for a job. With flock a holder process keeps it, in its
 * own process group (a terminal Ctrl-C reaches the run through this wrapper,
 * not the lock). The wrapper tells it the run's process group (adopt) and
 * says "done" at the end. If the wrapper dies instead (its pipe closes), the
 * holder keeps the lock until that group is gone, at most `holdS` seconds,
 * so a new job never overlaps a run that is still being ended. Without flock
 * it holds nothing.
 */
export async function acquireLockAt(path, holdS = 60, keepFd = null) {
  if (FLOCK) {
    const script = [
      `echo locked`,
      `g=`,
      `while IFS= read -r line; do`,
      `  case "$line" in`,
      `    "pgid "*) g=\${line#pgid } ;;`,
      `    done) exit 0 ;;`,
      `  esac`,
      `done`,
      `if [ -n "$g" ]; then`,
      `  end=$((SECONDS + ${holdS}))`,
      `  while kill -0 -- "-$g" 2>/dev/null && [ "$SECONDS" -lt "$end" ]; do sleep 0.5; done`,
      `fi`,
      `exit 0`,
    ].join("\n");
    if (!BASH) throw new Error(`cannot take the lock ${path}: no bash in /usr/bin, /bin or /usr/local/bin`);
    const stdio = keepFd === null ? ["pipe", "pipe", "ignore"] : stdioSharing(keepFd, ["pipe", "pipe", "ignore"]);
    const holder = spawn(FLOCK, ["-n", "-E", String(EXIT_LOCKED), path, BASH, "-c", script], {
      stdio,
      detached: true,
    });
    holder.stdin.on("error", () => {});
    const outcome = await new Promise((done) => {
      let output = "";
      holder.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("locked")) done({ acquired: true });
      });
      holder.on("exit", (code) => done({ acquired: false, code }));
      holder.on("error", (error) => done({ acquired: false, error }));
    });
    if (!outcome.acquired) {
      if (outcome.code === EXIT_LOCKED) return { ok: false, path };
      throw new Error(`cannot take the lock ${path}: flock ${outcome.error ? outcome.error.message : `exited ${outcome.code}`}`);
    }
    // Not unref'd: release() waits for the holder to exit, and an unref'd
    // child would let the process end (exit 0) before the result is reported.
    return {
      ok: true,
      path,
      holderPid: holder.pid,
      adopt: (pgid) => {
        try {
          holder.stdin.write(`pgid ${pgid}\n`);
        } catch {
          /* holder gone */
        }
      },
      release: () =>
        new Promise((done) => {
          if (holder.exitCode !== null || holder.signalCode !== null) return done();
          holder.on("exit", () => done());
          holder.stdin.end("done\n");
        }),
    };
  }
  return { ok: true, path, adopt: () => {}, release: async () => {} };
}

// ── Observing the run's process group ───────────────────────────────────────

let pageSize = 0;
function pageBytes() {
  if (!pageSize) {
    const out = spawnSync(sysBin("getconf") ?? "getconf", ["PAGESIZE"], { encoding: "utf8" });
    pageSize = Number((out.stdout ?? "").trim()) || 4096;
  }
  return pageSize;
}

/**
 * The live members of process group `pgid`, read from /proc: one directory
 * listing and one small read per process, no filesystem walk, no command-line
 * matching. Zombies (exited, not yet reaped) are reported separately; they
 * hold no memory. Returns null where /proc is unavailable.
 */
export function readGroup(pgid) {
  if (!LINUX) return null;
  const live = [];
  let zombies = 0;
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try {
      stat = readFileSync(`/proc/${name}/stat`, "utf8");
    } catch {
      continue; // exited between the listing and the read
    }
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    // fields[0] = state (field 3), fields[2] = pgrp (field 5), fields[21] = rss pages (field 24)
    if (Number(fields[2]) !== pgid) continue;
    if (fields[0] === "Z") {
      zombies += 1;
      continue;
    }
    live.push({ pid: Number(name), rssBytes: Number(fields[21]) * pageBytes() });
  }
  return { live, zombies };
}

/** Whether the group still has a live (non-zombie) member. */
export function groupLive(pgid) {
  let group = null;
  try {
    group = readGroup(pgid);
  } catch {
    /* /proc unreadable this instant: ask the kernel instead */
  }
  if (group) return group.live.length > 0;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/**
 * Sample the run's group every `sampleMs`. What the numbers are, and are not:
 * - the RSS sum adds each process's resident set, so pages shared between
 *   processes (libraries, copy-on-write) are counted more than once;
 * - a peak between two samples is missed, so the true peak can be higher;
 * - a process that left the group (setsid, a daemon) is not seen at all;
 * - none of this is a cgroup's memory.peak, which counts page cache and is
 *   exact; only a cgroup gives a real whole-run figure.
 * A sampling failure is recorded, never thrown: it cannot change the result.
 */
function observeGroup(pgid, sampleMs) {
  const stats = { sampleMs, samples: 0, failed: 0, peakRssBytes: 0, peakProcessBytes: 0, peakProcesses: 0, available: LINUX };
  if (!LINUX) return { stats, stop: () => stats };
  const take = () => {
    try {
      const group = readGroup(pgid);
      stats.samples += 1;
      const sum = group.live.reduce((total, member) => total + member.rssBytes, 0);
      const largest = group.live.reduce((max, member) => Math.max(max, member.rssBytes), 0);
      stats.peakRssBytes = Math.max(stats.peakRssBytes, sum);
      stats.peakProcessBytes = Math.max(stats.peakProcessBytes, largest);
      stats.peakProcesses = Math.max(stats.peakProcesses, group.live.length);
    } catch {
      stats.failed += 1;
    }
  };
  take();
  const timer = setInterval(take, sampleMs);
  timer.unref();
  return {
    stats,
    stop: () => {
      clearInterval(timer);
      return stats;
    },
  };
}

const mib = (bytes) => `${Math.round(bytes / 1048576)} MiB`;

// ── Process group run ───────────────────────────────────────────────────────

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    /* already gone */
  }
}

/**
 * A watchdog outside the test group, holding a pipe from this wrapper. A
 * "done" line means the run ended normally. EOF (this wrapper died) or the
 * hard deadline makes it end the group, TERM then KILL after the grace.
 */
function spawnWatchdog(pgid, hardS, graceS, say) {
  const script = [
    `g=${pgid}`,
    `if IFS= read -r -t ${hardS} line && [ "$line" = done ]; then exit 0; fi`,
    `kill -0 -- "-$g" 2>/dev/null || exit 0`,
    `kill -TERM -- "-$g" 2>/dev/null`,
    `sleep ${graceS}`,
    `kill -0 -- "-$g" 2>/dev/null && kill -KILL -- "-$g" 2>/dev/null`,
    `exit 0`,
  ].join("\n");
  const watchdog = spawn(BASH ?? "bash", ["-c", script], { detached: true, stdio: ["pipe", "ignore", "ignore"] });
  watchdog.on("error", (error) => say(`warning: no watchdog (${error.message}); the run is still bounded by this wrapper`));
  watchdog.stdin.on("error", () => {});
  watchdog.unref();
  return {
    done: () => {
      try {
        watchdog.stdin.end("done\n");
      } catch {
        /* already gone */
      }
    },
  };
}

const signalNumber = (signal) => osConstants.signals[signal] ?? 15;

/**
 * Run a command in its own process group under a wall-clock limit. Resolves
 * to { code, report }: the exit code to report and what was observed. Never
 * leaves the group running.
 */
export function runLimited(command, args, { timeoutS, graceS, env, label, quiet = false, onStart, sampleMs = 500 }) {
  return new Promise((resolveRun) => {
    const say = (line) => {
      if (!quiet) process.stderr.write(`[run-tests] ${line}\n`);
    };
    const startedAt = Date.now();
    // Node hands a child only the descriptors in `stdio`, so the run never
    // inherits the gate's lock descriptor (the self-check proves it): a
    // leftover cannot hold the lock for every job on the machine.
    // On Windows a .cmd shim (vitest.cmd, npm) needs a shell to start.
    const child = spawn(command, args, {
      cwd: REPO,
      env,
      stdio: quiet ? "ignore" : "inherit",
      detached: POSIX,
      shell: !POSIX,
    });
    const pgid = child.pid;
    const report = {
      label,
      pid: pgid ?? null,
      pgid: POSIX ? (pgid ?? null) : null,
      timedOut: false,
      killed: false,
      leftovers: 0,
      zombies: 0,
      observed: null,
      exitCode: 1,
      durationMs: 0,
    };
    if (pgid === undefined) {
      child.on("error", (error) => {
        say(`FAILED: could not start ${command}: ${error.message}`);
        report.durationMs = Date.now() - startedAt;
        resolveRun({ code: 1, report });
      });
      return;
    }
    onStart?.(pgid);
    const observer = POSIX ? observeGroup(pgid, sampleMs) : null;
    const watchdog = POSIX ? spawnWatchdog(pgid, timeoutS + graceS + 10, graceS, say) : null;
    let forwarded = null;
    let killTimer = null;

    const stopGroup = (signal) => {
      if (POSIX) signalGroup(pgid, signal);
      else spawnSync("taskkill", ["/PID", String(pgid), "/T", "/F"], { stdio: "ignore" });
    };
    const terminate = (reason) => {
      say(`${reason}: sending SIGTERM to the test process group ${pgid}`);
      stopGroup("SIGTERM");
      // taskkill /F already ends the tree on Windows; only POSIX escalates.
      if (!POSIX) return;
      killTimer = setTimeout(() => {
        if (groupLive(pgid)) {
          report.killed = true;
          say(`still running ${graceS}s after SIGTERM: sending SIGKILL`);
          stopGroup("SIGKILL");
        }
      }, graceS * 1000);
    };

    const deadline = setTimeout(() => {
      report.timedOut = true;
      terminate(`${label} exceeded ${timeoutS}s`);
    }, timeoutS * 1000);

    const handlers = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => {
      const handler = () => {
        if (forwarded) return;
        forwarded = signal;
        terminate(`received ${signal}`);
      };
      process.on(signal, handler);
      return [signal, handler];
    });

    child.on("exit", async (code, signal) => {
      clearTimeout(deadline);
      if (POSIX) {
        // Give exiting workers time before calling anything a leftover: up
        // to the grace (at most 10 s), returning as soon as the group is empty.
        const settle = Date.now() + Math.min(graceS, 10) * 1000;
        while (groupLive(pgid) && Date.now() < settle) await new Promise((r) => setTimeout(r, 100));
        let group = null;
        try {
          group = readGroup(pgid);
        } catch {
          /* fall back to the kernel's answer below */
        }
        const stillLive = group ? group.live.length : groupLive(pgid) ? 1 : 0;
        // Exited but not yet reaped: no memory, never counted as leftovers
        // (on Linux; without /proc the kernel fallback cannot tell them apart).
        report.zombies = group ? group.zombies : 0;
        if (stillLive > 0) {
          // Only members of the run's own process group (it was created for
          // this run), so nothing unrelated is ever targeted.
          report.leftovers = stillLive;
          const pids = group ? group.live.map((member) => member.pid).join(" ") : "unknown";
          say(`processes still running in the test group after it ended (pids ${pids}): ending them`);
          signalGroup(pgid, "SIGTERM");
          const until = Date.now() + graceS * 1000;
          while (groupLive(pgid) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
          if (groupLive(pgid)) {
            report.killed = true;
            signalGroup(pgid, "SIGKILL");
          }
        }
      }
      if (killTimer) clearTimeout(killTimer);
      watchdog?.done();
      for (const [name, handler] of handlers) process.off(name, handler);
      report.durationMs = Date.now() - startedAt;
      report.observed = observer ? observer.stop() : null;
      let result;
      if (report.timedOut) {
        say(`FAILED: ${label} timed out after ${timeoutS}s${report.killed ? " and had to be killed" : ""}`);
        result = report.killed ? EXIT_KILLED : EXIT_TIMEOUT;
      } else if (forwarded) {
        say(`FAILED: ${label} stopped by ${forwarded}`);
        result = 128 + signalNumber(forwarded);
      } else if (signal) {
        say(`FAILED: ${label} ended by ${signal}`);
        result = 128 + signalNumber(signal);
      } else if ((code ?? 1) === 0 && report.leftovers > 0) {
        // The run said it passed but left live processes behind: that is a
        // leak in the tests, not a clean success.
        say(`FAILED: ${label} exited 0 but left ${report.leftovers} live process(es) behind`);
        result = EXIT_LEFTOVER;
      } else {
        result = code ?? 1;
      }
      report.exitCode = result;
      resolveRun({ code: result, report });
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
      watchdog?.done();
      for (const [name, handler] of handlers) process.off(name, handler);
      report.durationMs = Date.now() - startedAt;
      report.observed = observer ? observer.stop() : null;
      say(`FAILED: could not start ${command}: ${error.message}`);
      resolveRun({ code: 1, report });
    });
  });
}

/** One line on stderr (and optionally a JSON file) saying what was observed. */
function printReport(report) {
  const o = report.observed;
  const seen =
    o && o.available
      ? `group RSS sum peak ${mib(o.peakRssBytes)} · largest process ${mib(o.peakProcessBytes)} · up to ${o.peakProcesses} processes · ${o.samples} samples every ${o.sampleMs} ms${o.failed ? ` (${o.failed} failed)` : ""}`
      : "process-group observation unavailable on this platform";
  process.stderr.write(
    `[run-tests] ${report.label}: exit ${report.exitCode} in ${(report.durationMs / 1000).toFixed(1)}s` +
      `${report.timedOut ? " · timed out" : ""}${report.killed ? " · SIGKILL needed" : ""}` +
      `${report.leftovers ? ` · ${report.leftovers} leftover(s) ended` : " · nothing left behind"}` +
      `${report.zombies ? ` · ${report.zombies} zombie(s), not counted` : ""}\n` +
      `[run-tests] observed: ${seen}. Sampled, not exact: shared pages are counted per process, peaks between samples are missed, processes that left the group are not seen, and this is not a cgroup memory.peak.\n`,
  );
  const file = process.env.MORI_TEST_REPORT_FILE;
  if (file) writeReportFile(file, report);
}

/**
 * The JSON report goes only to a regular file directly in /tmp (never through
 * a symlink, never a FIFO or device, never a file with other hard links, never
 * into the repository), so it cannot overwrite tracked files or block the run
 * while it holds the lock. Opened without following links and without
 * blocking, then checked on the open descriptor.
 */
function openReport(target, flags) {
  const fd = openSync(target, flags | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK, 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1) {
    closeSync(fd);
    throw new Error("not a plain file");
  }
  return fd;
}

function writeReportFile(file, report) {
  const target = resolve(file);
  let allowed = POSIX && dirname(target) === "/tmp";
  try {
    if (allowed) allowed = realpathSync(dirname(target)) === "/tmp";
  } catch {
    allowed = false;
  }
  if (!allowed) {
    process.stderr.write(`[run-tests] report not written: ${file} must be a plain file directly in /tmp\n`);
    return;
  }
  try {
    const runs = [];
    if (process.env.MORI_TEST_REPORT_APPEND === "1") {
      let fd = null;
      try {
        fd = openReport(target, fsConstants.O_RDONLY);
        const previous = JSON.parse(readFileSync(fd, "utf8"));
        if (Array.isArray(previous.runs)) runs.push(...previous.runs);
      } catch (error) {
        if (error.message === "not a plain file") throw error;
        /* new file, or not a report yet */
      } finally {
        if (fd !== null) closeSync(fd);
      }
    }
    runs.push(report);
    const fd = openReport(target, fsConstants.O_WRONLY | fsConstants.O_CREAT);
    try {
      ftruncateSync(fd, 0);
      const bytes = Buffer.from(`${JSON.stringify({ runs }, null, 2)}\n`);
      for (let at = 0; at < bytes.length; ) {
        const written = writeSync(fd, bytes, at, bytes.length - at, at);
        if (written <= 0) throw new Error("short write");
        at += written;
      }
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    process.stderr.write(`[run-tests] could not write the report to ${file}: ${error.message}\n`);
  }
}

// ── Modes ───────────────────────────────────────────────────────────────────

function childEnv(heapMb, maxWorkers) {
  const flag = `--max-old-space-size=${heapMb}`;
  const cleaned = (process.env.NODE_OPTIONS ?? "").replace(/--max-old-space-size=\d+/g, "").trim();
  const env = { ...process.env, NODE_OPTIONS: `${cleaned} ${flag}`.trim() };
  // Vitest applies VITEST_MAX_WORKERS to every project after the config, so
  // an inherited one would lift the cap and un-serialise the smoke tests.
  delete env.VITEST_MAX_WORKERS;
  if (maxWorkers !== undefined) env.MORI_TEST_MAX_WORKERS = String(maxWorkers);
  return env;
}

/**
 * Run `fn` under the heavy-job lock. The run's exit code is recorded in
 * process.exitCode before the lock is released, so no early end of the
 * process can turn a failure into a success.
 */
async function underHeavyLock(fn, lockPath = HEAVY_LOCK, holdS = 60) {
  const lock = await acquireHeavyLock(lockPath, process.env, holdS);
  if (!lock.ok) {
    process.stderr.write(
      `[run-tests] FAILED: another heavy Mori job holds ${lock.path}; jobs never overlap on this machine. Wait for it, do not stop it.\n`,
    );
    process.exitCode = EXIT_LOCKED;
    return EXIT_LOCKED;
  }
  if (lock.covered) process.stderr.write(`[run-tests] inside the gate's lock (${lock.covered})\n`);
  if (lock.unlocked) process.stderr.write(`[run-tests] warning: ${lock.unlocked}; runs are bounded but not kept apart\n`);
  let code = 1;
  try {
    code = await fn(lock);
    return code;
  } finally {
    process.exitCode = code;
    await lock.release();
  }
}

/** The Vitest run itself, under a lock the caller already holds. */
async function vitestJob(args, lock) {
  const { maxWorkers, heapMb, timeoutS, graceS, sampleMs } = limits();
  const rest = args[0] === "run" ? args.slice(1) : args;
  const bin = join(REPO, "node_modules", ".bin", POSIX ? "vitest" : "vitest.cmd");
  process.stderr.write(
    `[run-tests] vitest run · workers ${maxWorkers} · heap ${heapMb} MB per Node process (not a total) · limit ${timeoutS}s (+${graceS}s grace)\n`,
  );
  const { code, report } = await runLimited(bin, ["run", `--maxWorkers=${maxWorkers}`, ...rest], {
    timeoutS,
    graceS,
    sampleMs,
    onStart: (pgid) => lock.adopt(pgid),
    env: childEnv(heapMb, maxWorkers),
    label: "the Vitest run",
  });
  printReport(report);
  return code;
}

/** The node:test harness, under a lock the caller already holds. */
async function harnessJob(lock) {
  const { heapMb, timeoutS, graceS, sampleMs } = limits();
  const files = readdirSync(join(REPO, "scripts", "lib"))
    .filter((name) => name.endsWith(".node.mjs"))
    .map((name) => join("scripts", "lib", name));
  const { code, report } = await runLimited(process.execPath, ["--test", ...files], {
    timeoutS,
    graceS,
    sampleMs,
    onStart: (pgid) => lock.adopt(pgid),
    env: childEnv(heapMb),
    label: "the node:test harness",
  });
  printReport(report);
  return code;
}

const holdFor = () => limits().graceS + 30;

async function runVitest(args) {
  const refused = refuseVitestArgs(args);
  if (refused) {
    process.stderr.write(`[run-tests] refused: ${refused}\n`);
    return EXIT_REFUSED;
  }
  return underHeavyLock((lock) => vitestJob(args, lock), HEAVY_LOCK, holdFor());
}

async function runHarness() {
  return underHeavyLock((lock) => harnessJob(lock), HEAVY_LOCK, holdFor());
}

/** `npm test`: the Vitest suite then the harness, as one job under one lock,
 *  so nothing else can start between them. */
async function runSuite(args) {
  if (args.length > 0) {
    process.stderr.write("[run-tests] refused: the suite takes no arguments; use the vitest mode to narrow\n");
    return EXIT_REFUSED;
  }
  return underHeavyLock(
    async (lock) => {
      const vitest = await vitestJob([], lock);
      if (vitest !== 0) return vitest;
      process.env.MORI_TEST_REPORT_APPEND = "1";
      return harnessJob(lock);
    },
    HEAVY_LOCK,
    holdFor(),
  );
}

async function runStep(args) {
  const separator = args.indexOf("--");
  const seconds = Number(args[0]);
  if (separator !== 1 || !Number.isInteger(seconds) || seconds < 1 || args.length < 3) {
    process.stderr.write("[run-tests] usage: limited <seconds> -- <command> [args]\n");
    return EXIT_REFUSED;
  }
  const [command, ...rest] = args.slice(2);
  // Only the gate's own steps: the production build and the Rust pass. Never
  // a way around the test entry point.
  const isBuild = command === "npm" && rest.length === 2 && rest[0] === "run" && rest[1] === "build";
  const isRust = command === "bash" && rest.length === 2 && rest[0] === "-c" && rest[1].startsWith("cd src-tauri && cargo ");
  if (!isBuild && !isRust) {
    process.stderr.write("[run-tests] refused: limited runs only the gate's build and Rust pass\n");
    return EXIT_REFUSED;
  }
  const { graceS, sampleMs } = limits();
  return underHeavyLock(
    async (lock) => {
      const { code, report } = await runLimited(command, rest, {
        timeoutS: seconds,
        graceS,
        sampleMs,
        onStart: (pgid) => lock.adopt(pgid),
        env: process.env,
        label: process.env.MORI_STEP_LABEL || basename(command),
      });
      printReport(report);
      return code;
    },
    HEAVY_LOCK,
    holdFor(),
  );
}

// ── Self-check ──────────────────────────────────────────────────────────────

/**
 * Proves the limits without running a test: the argument rules, a run that
 * overstays its limit, a run that ignores SIGTERM, a wrapper SIGKILLed
 * mid-run, Ctrl-C under the lock, the lock itself, the gate-lock
 * verification (genuine, forged and contended), group observation and the
 * leftover rule. Sleeps and a small allocation only; private lock files, never
 * the real heavy lock; checks by process group, never by scanning the machine.
 */
async function selfCheck() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}\n`);
  };
  const until = async (condition, ms) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
    return condition();
  };

  const refused = [
    ["--root", "/"],
    ["--root=/"],
    ["-r", "/"],
    ["--r=/"],
    ["-ur=/"],
    ["--dir", "/"],
    ["/tmp/x.test.ts"],
    ["../outside.test.ts"],
    ["scripts/x.test.ts"],
    ["--config", "/tmp/vitest.config.ts"],
    ["--c=/tmp/vitest.config.ts"],
    ["-uc=/tmp/vitest.config.ts"],
    ["--watch"],
    ["--w"],
    ["-uw"],
    ["watch"],
    ["related", "src/x.ts"],
    ["--maxWorkers=16"],
    ["--max-workers=16"],
    ["--pool=threads"],
    ["--execArgv=--max-old-space-size=99999"],
    ["--outputFile=/tmp/out.json"],
    ["--", "--root", "/"],
    ["---allowOnly"],
    ["src-tauri/x.test.ts"],
    ["--config", "src/other.config.ts"],
    ["--reporter=/tmp/r.mjs"],
    ["-u", "src/lib/timeline/labelRooms.test.ts"],
    ["--update=src/lib/timeline/labelRooms.test.ts"],
    ["--reporter=basic"],
    ["--no-config", "vite.config.ts"],
    // Under `vitest run` these do not print and exit: they run every test.
    ["--version"],
    ["-v"],
  ];
  for (const args of refused) check(`refuses ${args.join(" ")}`, refuseVitestArgs(args) !== null);
  const accepted = [
    ["run"],
    ["src/lib/timeline/labelRooms.test.ts"],
    ["labelRooms"],
    ["--changed"],
    ["-t", "a name"],
    ["--project", "unit"],
    ["--config", "vite.config.ts"],
    ["-u"],
    ["--reporter=dot"],
    ["--changed", "origin/main"],
    ["src/lib/timeline/labelRooms.test.ts", "-u"],
  ];
  for (const args of accepted) check(`accepts ${args.join(" ")}`, refuseVitestArgs(args) === null);

  const privateLock = (tag) => join(POSIX ? "/tmp" : tmpdir(), `mori-selfcheck-${tag}-${process.pid}.lock`);
  const cleanLock = (path) => {
    rmSync(path, { force: true });
  };

  if (!POSIX) {
    process.stdout.write("process-group drills skipped: not available on this platform\n");
  } else {
    // Durations unique to this run, so nothing else on the machine is mistaken for ours.
    const base = 3000 + (process.pid % 997) * 7;
    const sleeping = (script, extra = {}) =>
      runLimited("bash", ["-c", script], { timeoutS: 1, graceS: 1, env: process.env, label: "drill", quiet: true, ...extra });

    let pgid = 0;
    const overlong = await sleeping(`sleep ${base} & sleep ${base + 1}`, { onStart: (id) => (pgid = id) });
    check("an overlong run times out with exit 124", overlong.code === EXIT_TIMEOUT, `exit ${overlong.code}`);
    check("its whole process group is gone", await until(() => !groupLive(pgid), 3000));

    const stubborn = await sleeping(`trap "" TERM; sleep ${base + 2} & sleep ${base + 3}`, { onStart: (id) => (pgid = id) });
    // bash ignores TERM and so do the sleeps it starts (an ignored signal is
    // inherited), so only SIGKILL ends them.
    check("a run ignoring SIGTERM is killed after the grace (exit 137)", stubborn.code === EXIT_KILLED, `exit ${stubborn.code}`);
    check("nothing of it is left", await until(() => !groupLive(pgid), 3000));

    // A run that exits 0 but leaves a live child in its group fails (70).
    const leaky = await runLimited("bash", ["-c", `sleep ${base + 4} & exit 0`], {
      timeoutS: 30,
      graceS: 1,
      env: process.env,
      label: "drill",
      quiet: true,
      onStart: (id) => (pgid = id),
    });
    check("a run that exits 0 but leaves a live process fails with 70", leaky.code === EXIT_LEFTOVER, `exit ${leaky.code}`);
    check("the leftover was ended", leaky.report.leftovers === 1 && (await until(() => !groupLive(pgid), 3000)));

    // Observation comes from the run's own group: a 64 MiB allocation shows.
    if (LINUX) {
      const allocating = await runLimited(
        process.execPath,
        ["-e", "const b = Buffer.alloc(64 * 1048576, 1); setTimeout(() => process.exit(b[0] === 1 ? 0 : 1), 1500)"],
        { timeoutS: 30, graceS: 1, env: process.env, label: "drill", quiet: true, sampleMs: 100 },
      );
      const o = allocating.report.observed;
      check("observation sees the run's own memory", allocating.code === 0 && o.peakProcessBytes >= 64 * 1048576, `largest ${mib(o.peakProcessBytes)}, ${o.samples} samples`);
    }

    // The wrapper itself SIGKILLed mid-run: the watchdog sees its pipe close.
    const orphan = spawn(process.execPath, [SELF, "self-check-orphan", String(base + 5)], {
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    });
    let orphanGroup = 0;
    orphan.stdout.on("data", (chunk) => {
      const id = Number(String(chunk).trim().split("\n")[0]);
      if (id > 0) orphanGroup = id;
    });
    const started = await until(() => orphanGroup > 0 && groupLive(orphanGroup), 15000);
    check("a sleeping run starts under a wrapper", started);
    orphan.kill("SIGKILL");
    check("after the wrapper is SIGKILLed, the watchdog ends the run", started && (await until(() => !groupLive(orphanGroup), 10000)));

    // Ctrl-C (SIGINT) to a wrapper holding a lock: exit 130, nothing left, lock free.
    const intLock = privateLock("int");
    const interrupted = spawn(process.execPath, [SELF, "self-check-locked", String(base + 6), intLock], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, MORI_TEST_KILL_GRACE_S: "1", MORI_HEAVY_LOCK_FD: "" },
    });
    let lockedGroup = 0;
    let interruptedCode = null;
    interrupted.on("exit", (code) => (interruptedCode = code));
    interrupted.stdout.on("data", (chunk) => {
      const id = Number(String(chunk).trim().split("\n")[0]);
      if (id > 0) lockedGroup = id;
    });
    const running = await until(() => lockedGroup > 0 && groupLive(lockedGroup), 15000);
    interrupted.kill("SIGINT");
    await until(() => interruptedCode !== null, 10000);
    check("Ctrl-C to a locked run reports 130", running && interruptedCode === 130, `exit ${interruptedCode}`);
    check("and leaves nothing running", running && (await until(() => !groupLive(lockedGroup), 5000)));
    const relocked = await acquireLockAt(intLock);
    check("and frees the lock", relocked.ok);
    if (relocked.ok) await relocked.release();
    cleanLock(intLock);

    // The gate-lock verification, with a private lock file.
    if (FLOCK) {
      const gateLock = privateLock("gate");
      const bash = sysBin("bash") ?? "bash";
      const node = `"${process.execPath}" "${SELF}"`;
      // A stand-in gate: holds the lock on fd 9, as scripts/check.sh does.
      const asGate = (body) =>
        spawnSync(bash, ["-c", `exec 9>>"$LOCK"; "$FLOCK" -n 9 || exit 75; ${body}`], {
          cwd: REPO,
          env: { ...process.env, LOCK: gateLock, FLOCK },
          encoding: "utf8",
          timeout: 60_000,
          killSignal: "SIGKILL",
        });
      const lines = (result) => (result.stdout ?? "").trim().split("\n");

      const genuine = asGate(`MORI_HEAVY_LOCK_FD=9 ${node} self-check-covered "$LOCK"; "$FLOCK" -n "$LOCK" true; echo "still=$?"`);
      check("a wrapper inside the gate uses the gate's lock (verified fd)", lines(genuine)[0] === "covered", lines(genuine).join(" "));
      check("the probe leaves the gate's lock held", lines(genuine)[1] === "still=1", lines(genuine).join(" "));
      // npm is Node, and Node passes no extra descriptors to its children:
      // a wrapper reached through npm is not covered and fails closed (75).
      // That is why the gate calls `node scripts/run-tests.mjs` directly.
      const throughNpm = asGate(`MORI_HEAVY_LOCK_FD=9 npm exec --offline -c '${node} self-check-covered "$LOCK"'`);
      check("a wrapper reached through npm is not covered (fails closed)", lines(throughNpm).at(-1) === "not covered", lines(throughNpm).join(" "));
      // What the wrapper starts never holds the gate's descriptor, and the
      // inner holder does, on purpose.
      const children = asGate(`MORI_HEAVY_LOCK_FD=9 ${node} self-check-descriptors "$LOCK"`);
      check("a run started inside the gate does not inherit the gate's descriptor", lines(children).includes("run clean"), lines(children).join(" "));
      check("the inner holder keeps the gate's descriptor", lines(children).includes("holder kept"), lines(children).join(" "));
      const wrongFd = asGate(`MORI_HEAVY_LOCK_FD=8 ${node} self-check-covered "$LOCK"`);
      check("a wrong descriptor is not trusted", lines(wrongFd)[0] === "not covered", lines(wrongFd).join(" "));
      // Two jobs inside the same gate: the inner lock keeps them apart.
      const twoInside = asGate(
        `export MORI_HEAVY_LOCK_FD=9; ${node} self-check-hold "$LOCK" 3 & sleep 1.5; ${node} self-check-hold "$LOCK" 0; wait`,
      );
      const outcomes = lines(twoInside).sort().join(" ");
      check("two jobs inside one gate never overlap (inner lock)", outcomes === "acquired refused", outcomes);

      // Someone else holds the lock: a forged descriptor to the same file must not pass.
      const holder = await acquireLockAt(gateLock);
      const forged = spawnSync(bash, ["-c", `exec 9>>"$LOCK"; MORI_HEAVY_LOCK_FD=9 ${node} self-check-covered "$LOCK"`], {
        env: { ...process.env, LOCK: gateLock },
        encoding: "utf8",
        timeout: 60_000,
        killSignal: "SIGKILL",
      });
      check("a forged descriptor to a lock held elsewhere is refused", lines(forged)[0] === "not covered", lines(forged).join(" "));
      const contender = await acquireHeavyLock(gateLock, { MORI_HEAVY_LOCK_FD: "" });
      check("a second job while one holds the lock is refused (75)", holder.ok && !contender.ok);
      if (holder.ok) await holder.release();
      const after = await acquireHeavyLock(gateLock, { MORI_HEAVY_LOCK_FD: "" });
      check("the lock is free again once released", after.ok);
      if (after.ok) await after.release();
      cleanLock(gateLock);
      cleanLock(`${gateLock}.inner`);
    }
  }

  const failed = results.filter((ok) => !ok).length;
  process.stdout.write(
    failed === 0 ? `self-check passed (${results.length} checks)\n` : `self-check FAILED: ${failed} of ${results.length}\n`,
  );
  return failed === 0 ? 0 : 1;
}

async function main() {
  const [mode = "vitest", ...args] = process.argv.slice(2);
  try {
    if (mode === "vitest") return await runVitest(args);
    if (mode === "harness") return await runHarness();
    if (mode === "suite") return await runSuite(args);
    if (mode === "self-check") return await selfCheck();
    if (mode === "limited") return await runStep(args);
    // The modes below exist only for the self-check's drills.
    if (mode === "self-check-locked") {
      const { graceS } = limits();
      return await underHeavyLock(async () => {
        const { code } = await runLimited("bash", ["-c", `sleep ${Number(args[0]) || 3998}`], {
          timeoutS: 120,
          graceS,
          env: process.env,
          label: "interrupt drill",
          quiet: true,
          onStart: (pgid) => process.stdout.write(`${pgid}\n`),
        });
        return code;
      }, args[1]);
    }
    if (mode === "self-check-orphan") {
      const { code } = await runLimited("bash", ["-c", `sleep ${Number(args[0]) || 3999}`], {
        timeoutS: 120,
        graceS: 1,
        env: process.env,
        label: "orphan drill",
        quiet: true,
        onStart: (pgid) => process.stdout.write(`${pgid}\n`),
      });
      return code;
    }
    if (mode === "self-check-hold") {
      // Takes the heavy lock at args[0] (inside a stand-in gate), says whether
      // it got it, holds it args[1] seconds.
      const lock = await acquireHeavyLock(args[0], process.env, 5);
      process.stdout.write(lock.ok ? "acquired\n" : "refused\n");
      if (lock.ok) {
        await new Promise((r) => setTimeout(r, (Number(args[1]) || 0) * 1000));
        await lock.release();
      }
      return 0;
    }
    if (mode === "self-check-descriptors") {
      // Inside a stand-in gate: does a spawned run see the gate's lock file
      // on fd 9, and does the inner holder?
      const target = (pid) => {
        try {
          return readlinkSync(`/proc/${pid}/fd/9`);
        } catch {
          return "";
        }
      };
      const run = spawnSync("/bin/sh", ["-c", 'readlink /proc/self/fd/9 || true'], { encoding: "utf8" });
      process.stdout.write((run.stdout ?? "").trim() === resolve(args[0]) ? "run inherited\n" : "run clean\n");
      const lock = await acquireHeavyLock(args[0], process.env, 5);
      process.stdout.write(lock.covered && lock.holderPid && target(lock.holderPid) === resolve(args[0]) ? "holder kept\n" : "holder without it\n");
      if (lock.ok) await lock.release();
      return 0;
    }
    if (mode === "self-check-covered") {
      process.stdout.write(coveredByGate(args[0]).ok ? "covered\n" : "not covered\n");
      return 0;
    }
  } catch (error) {
    process.stderr.write(`[run-tests] FAILED: ${error.message}\n`);
    return 1;
  }
  process.stderr.write(`[run-tests] unknown mode ${mode}: use suite, vitest, harness, self-check or limited\n`);
  return EXIT_REFUSED;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().then((code) => {
    process.exitCode = code;
    process.exit(code);
  });
}
