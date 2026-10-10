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
 *   `--maxWorkers` and as `VITEST_MAX_WORKERS`, which outranks both.
 * - Each Node process gets a V8 heap cap (`MORI_TEST_HEAP_MB`, default 2048).
 *   That bounds the JavaScript heap of each process, not a process's total
 *   memory and not the run's total. A whole-run memory cap needs a cgroup.
 * - A wall-clock limit (`MORI_TEST_TIMEOUT_S`, default 900 s) ends the run with
 *   SIGTERM to its whole process group, then SIGKILL after a grace period
 *   (`MORI_TEST_KILL_GRACE_S`, default 15 s). Exit 124, or 137 if it had to be
 *   killed.
 * - The run gets its own process group, so what it spawns (Vitest workers, the
 *   smoke tests' bash, python3 and git) is signalled with it. Signals sent to
 *   this wrapper are forwarded the same way. Processes still in the group when
 *   the run ends are reported and ended. A process that leaves the group on
 *   purpose (setsid, a daemon) is beyond this: only a cgroup contains it.
 * - A watchdog outside the group holds a pipe from this wrapper. If the
 *   wrapper dies (SIGKILL cannot be caught) the pipe closes and the watchdog
 *   ends the group; it also enforces a hard deadline (limit + grace + 10 s).
 * - One test run at a time on this machine: `flock` on /tmp/mori-test-run.lock
 *   (released by the kernel even if the holder is killed). A second run fails
 *   at once with exit 75 instead of doubling the load.
 *
 * Usage:
 *   node scripts/run-tests.mjs vitest [args]               the Vitest suite
 *   node scripts/run-tests.mjs harness                     the node:test harness
 *   node scripts/run-tests.mjs self-check                  proves the limits,
 *                                                          with sleeps, no tests
 *   node scripts/run-tests.mjs limited <secs> -- <cmd...>  another gate step
 *                                                          (build, cargo) under
 *                                                          the same group limit
 */
import { spawn, spawnSync } from "node:child_process";
import { constants as osConstants, tmpdir } from "node:os";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const POSIX = process.platform !== "win32";
// A fixed path, not $TMPDIR: the lock must be the same for every session on
// the machine, whatever its environment says.
const LOCK_BASE = POSIX ? "/tmp" : tmpdir();

export const EXIT_TIMEOUT = 124;
export const EXIT_KILLED = 137;
export const EXIT_LOCKED = 75;
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
  ["reporter", "value"],
  ["outputFile", "path"],
  ["bail", "optional"],
  ["passWithNoTests", "flag"],
  ["silent", "optional"],
  ["update", "flag"],
  ["shard", "value"],
  ["retry", "value"],
  ["allowOnly", "flag"],
  ["hideSkippedTests", "flag"],
  ["logHeapUsage", "flag"],
  ["expandSnapshotDiff", "flag"],
  ["testTimeout", "value"],
  ["hookTimeout", "value"],
  ["config", "config"],
  ["help", "flag"],
  ["version", "flag"],
]);
/** Short options let through (Vitest's own aliases for the above). */
const ALLOWED_SHORT = new Map([
  ["t", "testNamePattern"],
  ["u", "update"],
  ["h", "help"],
  ["v", "version"],
  ["c", "config"],
]);
/** Words Vitest reads as a mode, not a filter. Only `run` is a bounded one. */
const MODE_WORDS = new Set(["watch", "dev", "related", "bench", "list", "init", "typecheck"]);

const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

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
      if (looksLikePath && !relative(REPO, resolve(REPO, arg)).startsWith(`src`)) {
        return `test path ${arg} is outside src/, where tests are discovered`;
      }
      continue;
    }
    // Normalise as Vitest's parser does: any number of dashes, `=` values,
    // and a single-dash cluster of short flags (the value goes to the last).
    const doubleDash = arg.startsWith("--");
    const body = arg.replace(/^-+/, "");
    const equals = body.indexOf("=");
    const head = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1);
    const names = !doubleDash && head.length > 1 ? [...head] : [head];
    for (let n = 0; n < names.length; n += 1) {
      const raw = names[n];
      const isLast = n === names.length - 1;
      const long = raw.length === 1 ? ALLOWED_SHORT.get(raw) : camel(raw.startsWith("no-") ? raw.slice(3) : raw);
      const kind = long ? ALLOWED_LONG.get(long) : undefined;
      if (!long || !kind) return `${arg} is not an allowed option (see docs/test-run-safety.md)`;
      if (!isLast && kind !== "flag") return `${arg}: ${raw} takes a value and cannot sit inside a cluster`;
      if (!isLast || kind === "flag") continue;
      let value = inlineValue;
      if (value === undefined && kind !== "optional" && index + 1 < args.length && !args[index + 1].startsWith("-")) {
        value = args[index + 1];
        index += 1;
      }
      if ((kind === "value" || kind === "path" || kind === "config") && value === undefined) {
        return `${arg} needs a value`;
      }
      if (kind === "path" && (isAbsolute(value) || !insideRepo(value))) {
        return `${arg}: ${value} is outside the repository`;
      }
      if (kind === "config" && (isAbsolute(value) || !insideRepo(value))) {
        return `${arg} must name a config inside the repository`;
      }
    }
  }
  return null;
}

// ── Machine-wide lock ───────────────────────────────────────────────────────

/**
 * Hold a machine-wide lock for the life of this process. With `flock` the
 * kernel releases it when the holder dies, so a killed run never leaves a
 * stale lock. Without it (macOS), a directory lock records the holder's pid
 * and start time.
 */
export async function acquireLock(name) {
  const path = join(LOCK_BASE, `${name}.lock`);
  if (POSIX && commandExists("flock")) {
    const holder = spawn("flock", ["-n", "-E", String(EXIT_LOCKED), path, "-c", "echo locked; read _"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    holder.stdin.on("error", () => {});
    const acquired = await new Promise((done) => {
      let output = "";
      holder.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("locked")) done(true);
      });
      holder.on("exit", () => done(false));
      holder.on("error", () => done(false));
    });
    if (!acquired) return { ok: false, path };
    return {
      ok: true,
      path,
      release: () =>
        new Promise((done) => {
          holder.on("exit", () => done());
          holder.stdin.end("\n");
        }),
    };
  }
  return directoryLock(path);
}

function directoryLock(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "owner"), `${process.pid} ${startTime(process.pid)}`);
      return { ok: true, path, release: async () => rmSync(path, { recursive: true, force: true }) };
    } catch (error) {
      if (error.code !== "EEXIST") throw new Error(`cannot create the lock ${path}: ${error.message}`);
    }
    let owner = "";
    try {
      owner = readFileSync(join(path, "owner"), "utf8").trim();
    } catch {
      /* being written right now */
    }
    const [pid, started] = owner.split(" ");
    let young = false;
    try {
      young = Date.now() - statSync(path).mtimeMs < 30_000;
    } catch {
      /* removed meanwhile */
    }
    // An owner still writing its stamp, or alive with the same start time, holds it.
    if ((owner === "" && young) || (pid && pidAlive(Number(pid)) && startTime(Number(pid)) === started)) {
      return { ok: false, path };
    }
    // Stale: move it aside atomically; only one contender wins the rename.
    try {
      renameSync(path, `${path}.stale-${process.pid}`);
      rmSync(`${path}.stale-${process.pid}`, { recursive: true, force: true });
    } catch {
      /* another contender took it over first */
    }
  }
  return { ok: false, path };
}

function startTime(pid) {
  try {
    // Field 22 of /proc/<pid>/stat: start time in clock ticks since boot.
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] ?? "";
  } catch {
    return "";
  }
}

function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// ── Process group run ───────────────────────────────────────────────────────

export function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    /* already gone */
  }
}

function groupMembers(pgid) {
  // The run leads its own session too (a detached spawn calls setsid), so its
  // session id equals its group id; procps `-g` selects by session.
  const out = spawnSync("ps", ["-o", "pid=,args=", "-g", String(pgid)], { encoding: "utf8" });
  return (out.stdout ?? "").trim();
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
  const watchdog = spawn("bash", ["-c", script], { detached: true, stdio: ["pipe", "ignore", "ignore"] });
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
 * to the exit code to report; never leaves the group running.
 */
export function runLimited(command, args, { timeoutS, graceS, env, label, quiet = false, onStart }) {
  return new Promise((resolveRun) => {
    const say = (line) => {
      if (!quiet) process.stderr.write(`[run-tests] ${line}\n`);
    };
    const child = spawn(command, args, { cwd: REPO, env, stdio: quiet ? "ignore" : "inherit", detached: POSIX });
    const pgid = child.pid;
    if (pgid === undefined) {
      child.on("error", (error) => {
        say(`FAILED: could not start ${command}: ${error.message}`);
        resolveRun(1);
      });
      return;
    }
    onStart?.(pgid);
    const watchdog = POSIX ? spawnWatchdog(pgid, timeoutS + graceS + 10, graceS, say) : null;
    let timedOut = false;
    let escalated = false;
    let forwarded = null;
    let killTimer = null;

    const stopGroup = (signal) => {
      if (POSIX) signalGroup(pgid, signal);
      else spawnSync("taskkill", ["/PID", String(pgid), "/T", "/F"], { stdio: "ignore" });
    };
    const terminate = (reason) => {
      say(`${reason}: sending SIGTERM to the test process group ${pgid}`);
      stopGroup("SIGTERM");
      killTimer = setTimeout(() => {
        if (!POSIX || groupAlive(pgid)) {
          escalated = true;
          say(`still running ${graceS}s after SIGTERM: sending SIGKILL`);
          stopGroup("SIGKILL");
        }
      }, graceS * 1000);
    };

    const deadline = setTimeout(() => {
      timedOut = true;
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
        // Give exiting workers a moment before calling anything a leftover.
        const settle = Date.now() + 2000;
        while (groupAlive(pgid) && Date.now() < settle) await new Promise((r) => setTimeout(r, 100));
        if (groupAlive(pgid)) {
          say(`processes left in the test group after it ended:\n${groupMembers(pgid) || "(listing unavailable)"}`);
          signalGroup(pgid, "SIGTERM");
          const until = Date.now() + graceS * 1000;
          while (groupAlive(pgid) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
          if (groupAlive(pgid)) {
            escalated = true;
            signalGroup(pgid, "SIGKILL");
          }
        }
      }
      if (killTimer) clearTimeout(killTimer);
      watchdog?.done();
      for (const [name, handler] of handlers) process.off(name, handler);
      if (timedOut) {
        say(`FAILED: ${label} timed out after ${timeoutS}s${escalated ? " and had to be killed" : ""}`);
        resolveRun(escalated ? EXIT_KILLED : EXIT_TIMEOUT);
      } else if (forwarded) {
        say(`FAILED: ${label} stopped by ${forwarded}`);
        resolveRun(128 + signalNumber(forwarded));
      } else if (signal) {
        say(`FAILED: ${label} ended by ${signal}`);
        resolveRun(128 + signalNumber(signal));
      } else {
        resolveRun(code ?? 1);
      }
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      watchdog?.done();
      say(`FAILED: could not start ${command}: ${error.message}`);
      resolveRun(1);
    });
  });
}

// ── Modes ───────────────────────────────────────────────────────────────────

function childEnv(heapMb, maxWorkers) {
  const flag = `--max-old-space-size=${heapMb}`;
  const cleaned = (process.env.NODE_OPTIONS ?? "").replace(/--max-old-space-size=\d+/g, "").trim();
  const env = { ...process.env, NODE_OPTIONS: `${cleaned} ${flag}`.trim() };
  if (maxWorkers !== undefined) {
    // VITEST_MAX_WORKERS outranks the config and the CLI: pin it to the cap.
    env.VITEST_MAX_WORKERS = String(maxWorkers);
    env.MORI_TEST_MAX_WORKERS = String(maxWorkers);
  }
  return env;
}

async function withLock(fn) {
  const lock = await acquireLock("mori-test-run");
  if (!lock.ok) {
    process.stderr.write(
      `[run-tests] FAILED: another Mori test run holds ${lock.path}; runs never overlap on this machine. Wait for it, do not stop it.\n`,
    );
    return EXIT_LOCKED;
  }
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

async function runVitest(args) {
  const refused = refuseVitestArgs(args);
  if (refused) {
    process.stderr.write(`[run-tests] refused: ${refused}\n`);
    return EXIT_REFUSED;
  }
  const { maxWorkers, heapMb, timeoutS, graceS } = limits();
  const rest = args[0] === "run" ? args.slice(1) : args;
  const bin = join(REPO, "node_modules", ".bin", POSIX ? "vitest" : "vitest.cmd");
  process.stderr.write(
    `[run-tests] vitest run · workers ${maxWorkers} · heap ${heapMb} MB per process · limit ${timeoutS}s (+${graceS}s grace)\n`,
  );
  return withLock(() =>
    runLimited(bin, ["run", `--maxWorkers=${maxWorkers}`, ...rest], {
      timeoutS,
      graceS,
      env: childEnv(heapMb, maxWorkers),
      label: "the Vitest run",
    }),
  );
}

async function runHarness() {
  const { heapMb, timeoutS, graceS } = limits();
  const files = readdirSync(join(REPO, "scripts", "lib"))
    .filter((name) => name.endsWith(".node.mjs"))
    .map((name) => join("scripts", "lib", name));
  return withLock(() =>
    runLimited(process.execPath, ["--test", ...files], {
      timeoutS,
      graceS,
      env: childEnv(heapMb),
      label: "the node:test harness",
    }),
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
  const { graceS } = limits();
  return runLimited(command, rest, {
    timeoutS: seconds,
    graceS,
    env: process.env,
    label: process.env.MORI_STEP_LABEL || basename(command),
  });
}

/**
 * Proves the limits without running a test: the argument rules, a run that
 * overstays its limit (its group must be gone after the grace), a run that
 * ignores SIGTERM (it must be killed), a wrapper SIGKILLed mid-run (the
 * watchdog must end the run) and the lock. Sleeps only; checks by process
 * group, never by scanning the machine.
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
  ];
  for (const args of accepted) check(`accepts ${args.join(" ")}`, refuseVitestArgs(args) === null);

  if (!POSIX) {
    process.stdout.write("process-group drills skipped: not available on this platform\n");
  } else {
    // Durations unique to this run, so nothing else on the machine is mistaken for ours.
    const base = 3000 + (process.pid % 997) * 5;
    let pgid = 0;
    const timeoutCode = await runLimited("bash", ["-c", `sleep ${base} & sleep ${base + 1}`], {
      timeoutS: 1,
      graceS: 1,
      env: process.env,
      label: "a sleeping run",
      quiet: true,
      onStart: (id) => (pgid = id),
    });
    check("an overlong run times out with exit 124", timeoutCode === EXIT_TIMEOUT, `exit ${timeoutCode}`);
    check("its whole process group is gone", await until(() => !groupAlive(pgid), 3000));

    const ignoreCode = await runLimited("bash", ["-c", `trap "" TERM; sleep ${base + 2} & sleep ${base + 3}`], {
      timeoutS: 1,
      graceS: 1,
      env: process.env,
      label: "a run that ignores SIGTERM",
      quiet: true,
      onStart: (id) => (pgid = id),
    });
    // bash ignores TERM and so do the sleeps it starts (an ignored signal is
    // inherited), so only SIGKILL ends them.
    check("a run ignoring SIGTERM is killed after the grace (exit 137)", ignoreCode === EXIT_KILLED, `exit ${ignoreCode}`);
    check("nothing of it is left", await until(() => !groupAlive(pgid), 3000));

    // The wrapper itself SIGKILLed mid-run (what a caller's own timeout may
    // do): the watchdog sees its pipe close and ends the run.
    const orphan = spawn(process.execPath, [SELF, "self-check-orphan", String(base + 4)], {
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    });
    let orphanGroup = 0;
    orphan.stdout.on("data", (chunk) => {
      const id = Number(String(chunk).trim().split("\n")[0]);
      if (id > 0) orphanGroup = id;
    });
    const started = await until(() => orphanGroup > 0 && groupAlive(orphanGroup), 15000);
    check("a sleeping run starts under a wrapper", started);
    orphan.kill("SIGKILL");
    const ended = started && (await until(() => !groupAlive(orphanGroup), 10000));
    check("after the wrapper is SIGKILLed, the watchdog ends the run", ended);
  }

  const lockName = `mori-test-run.selfcheck-${process.pid}`;
  const first = await acquireLock(lockName);
  const second = await acquireLock(lockName);
  check("a second run is refused while one holds the lock", first.ok && !second.ok);
  if (first.ok) await first.release();
  const third = await acquireLock(lockName);
  check("the lock is free again once released", third.ok);
  if (third.ok) await third.release();
  rmSync(join(LOCK_BASE, `${lockName}.lock`), { recursive: true, force: true });

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
    if (mode === "self-check") return await selfCheck();
    if (mode === "limited") return await runStep(args);
    if (mode === "self-check-orphan") {
      // Only for the self-check: a long sleeping run for it to SIGKILL us under.
      return await runLimited("bash", ["-c", `sleep ${Number(args[0]) || 3999}`], {
        timeoutS: 120,
        graceS: 1,
        env: process.env,
        label: "orphan drill",
        quiet: true,
        onStart: (pgid) => process.stdout.write(`${pgid}\n`),
      });
    }
  } catch (error) {
    process.stderr.write(`[run-tests] FAILED: ${error.message}\n`);
    return 1;
  }
  process.stderr.write(`[run-tests] unknown mode ${mode}: use vitest, harness, self-check or limited\n`);
  return EXIT_REFUSED;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().then((code) => process.exit(code));
}
