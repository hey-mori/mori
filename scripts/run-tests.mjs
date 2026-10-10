#!/usr/bin/env node
/**
 * The repository's test entry point, with resource limits.
 *
 * Mori is developed on a machine shared with other sessions and services, so a
 * test run must never be able to take the machine down. This wrapper is what
 * `npm test`, `scripts/check.sh` and the other test scripts call. It keeps the
 * meaning of the suite unchanged (the same files, the same assertions) and
 * bounds how it runs:
 *
 * - Discovery stays inside the repository. `--root`, `--dir` and a config or a
 *   test path outside the repository are refused before anything starts; a
 *   bare filename filter is not trusted to bound discovery (Vitest globs its
 *   `include` first and filters afterwards, which is how a `--root /` run once
 *   crawled the whole filesystem). `vite.config.ts` also pins `include` to
 *   `src/`.
 * - Workers are capped (`MORI_TEST_MAX_WORKERS`, default 2).
 * - Each Node process gets a V8 heap cap (`MORI_TEST_HEAP_MB`, default 2048).
 *   That bounds the JavaScript heap of each process, not the process's total
 *   memory and not the run's total: about (1 + workers) processes, each with
 *   native memory on top. A whole-run memory cap needs a cgroup (see
 *   docs/test-run-safety.md).
 * - A wall-clock limit (`MORI_TEST_TIMEOUT_S`, default 900 s) ends the run with
 *   SIGTERM to its whole process group, then SIGKILL after a grace period
 *   (`MORI_TEST_KILL_GRACE_S`, default 15 s). The run fails with exit 124.
 * - The run gets its own process group, so whatever it spawns (Vitest workers,
 *   the smoke tests' bash, python3 and git) is signalled with it. A signal sent
 *   to this wrapper is forwarded the same way. Processes still in the group
 *   when the run ends are reported and ended. A process that leaves the group
 *   on purpose (setsid, a daemon) is beyond this: only a cgroup catches it.
 * - If this wrapper is itself killed (SIGKILL cannot be caught), a separate
 *   watchdog process, outside the test group, notices and ends the group; it
 *   also enforces a hard deadline (limit + grace + 10 s) on its own.
 * - One run at a time on this machine: a lock in the system temp directory,
 *   shared by every worktree. A second run fails at once (exit 75) instead of
 *   doubling the load.
 *
 * Usage:
 *   node scripts/run-tests.mjs vitest [vitest args]   the Vitest suite (run mode)
 *   node scripts/run-tests.mjs harness                 the node:test harness
 *   node scripts/run-tests.mjs self-check              proves the limits work,
 *                                                      with sleeps, no tests
 *   node scripts/run-tests.mjs limited <secs> -- <cmd> any other gate step (the
 *                                                      build, cargo) under the
 *                                                      same group timeout
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

/**
 * Why these Vitest arguments are refused, or null when they are fine. Pure, so
 * the self-check can prove each rule without starting Vitest.
 */
export function refuseVitestArgs(args) {
  const valueOf = (flag, index) => {
    const arg = args[index];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    return args[index + 1];
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const name = arg.split("=")[0];
    if (name === "--root" || name === "-r" || name === "--dir") {
      return `${name} is not allowed: tests are discovered from the repository's own config (src/)`;
    }
    if (name === "--config" || name === "-c") {
      const value = valueOf(name, index);
      if (!value || !insideRepo(value)) return `${name} must name a config inside the repository`;
    }
    if (name === "--maxWorkers" || name === "--minWorkers" || name === "--pool" || name === "--no-file-parallelism") {
      return `${name} is set by the wrapper; use MORI_TEST_MAX_WORKERS to change the worker cap`;
    }
    if (name === "--watch" || name === "-w" || name === "--ui" || arg === "watch" || arg === "dev") {
      return `${arg} does not terminate; use npm run test:watch yourself, never from an agent`;
    }
    if (!arg.startsWith("-") && arg !== "run") {
      // A positional argument is a filename filter. Only a path inside the
      // repository is accepted; it narrows, it never widens, discovery.
      if (isAbsolute(arg) || !insideRepo(arg)) return `test path ${arg} is outside the repository`;
    }
  }
  return null;
}

/** A lock shared by every worktree on this machine: one test run at a time. */
function acquireLock(lockDir) {
  try {
    mkdirSync(lockDir);
  } catch {
    let holder = "";
    try {
      holder = readFileSync(join(lockDir, "pid"), "utf8").trim();
    } catch {
      /* a lock being created right now */
    }
    const alive = holder !== "" && pidAlive(Number(holder));
    if (alive) return { ok: false, holder };
    // The holder is gone (killed without cleanup): take the lock over.
    rmSync(lockDir, { recursive: true, force: true });
    try {
      mkdirSync(lockDir);
    } catch {
      return { ok: false, holder: "unknown" };
    }
  }
  writeFileSync(join(lockDir, "pid"), String(process.pid));
  return { ok: true, release: () => rmSync(lockDir, { recursive: true, force: true }) };
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

function groupAlive(pgid) {
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

/**
 * A watchdog outside the test group: if this wrapper dies (it cannot catch
 * SIGKILL), or the hard deadline passes, it ends the group, TERM then KILL.
 * A shell loop polling once every 2 s; the wrapper kills it when the run ends.
 */
function spawnWatchdog(pgid, hardS, graceS) {
  const script = [
    `w=${process.pid}; g=${pgid}; end=$((SECONDS + ${hardS}))`,
    `while kill -0 "$w" 2>/dev/null && [ "$SECONDS" -lt "$end" ]; do sleep 2; done`,
    `kill -0 -- "-$g" 2>/dev/null || exit 0`,
    `kill -TERM -- "-$g" 2>/dev/null; sleep ${graceS}; kill -KILL -- "-$g" 2>/dev/null; exit 0`,
  ].join("\n");
  const watchdog = spawn("bash", ["-c", script], { detached: true, stdio: "ignore" });
  watchdog.unref();
  return watchdog;
}

function groupMembers(pgid) {
  const out = spawnSync("ps", ["-o", "pid=,args=", "-g", String(pgid)], { encoding: "utf8" });
  return (out.stdout ?? "").trim();
}

/**
 * Run a command in its own process group under a wall-clock limit. Resolves
 * to the exit code to report; never leaves the group running.
 */
export function runLimited(command, args, { timeoutS, graceS, env, label, quiet = false }) {
  return new Promise((resolveRun) => {
    const say = (line) => {
      if (!quiet) process.stderr.write(`[run-tests] ${line}\n`);
    };
    const child = spawn(command, args, { cwd: REPO, env, stdio: quiet ? "ignore" : "inherit", detached: true });
    const pgid = child.pid;
    const watchdog = spawnWatchdog(pgid, timeoutS + graceS + 10, graceS);
    let timedOut = false;
    let escalated = false;
    let forwarded = null;
    let killTimer = null;

    const terminate = (reason) => {
      say(`${reason}: sending SIGTERM to the test process group ${pgid}`);
      signalGroup(pgid, "SIGTERM");
      killTimer = setTimeout(() => {
        if (groupAlive(pgid)) {
          escalated = true;
          say(`still running ${graceS}s after SIGTERM: sending SIGKILL`);
          signalGroup(pgid, "SIGKILL");
        }
      }, graceS * 1000);
    };

    const deadline = setTimeout(() => {
      timedOut = true;
      terminate(`${label} exceeded ${timeoutS}s`);
    }, timeoutS * 1000);

    const onSignal = (signal) => {
      if (forwarded) return;
      forwarded = signal;
      terminate(`received ${signal}`);
    };
    const handlers = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => {
      const handler = () => onSignal(signal);
      process.on(signal, handler);
      return [signal, handler];
    });

    child.on("exit", async (code, signal) => {
      clearTimeout(deadline);
      // Whatever the run left in its group (an orphaned worker, a smoke test's
      // child) is ended here, with the same grace, and reported.
      if (groupAlive(pgid)) {
        const members = groupMembers(pgid);
        say(`processes left in the test group after it ended:\n${members || "(listing unavailable)"}`);
        signalGroup(pgid, "SIGTERM");
        const until = Date.now() + graceS * 1000;
        while (groupAlive(pgid) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
        if (groupAlive(pgid)) {
          escalated = true;
          signalGroup(pgid, "SIGKILL");
        }
      }
      if (killTimer) clearTimeout(killTimer);
      signalGroup(watchdog.pid, "SIGKILL");
      for (const [name, handler] of handlers) process.off(name, handler);
      if (timedOut) {
        say(`FAILED: ${label} timed out after ${timeoutS}s${escalated ? " and had to be killed" : ""}`);
        resolveRun(escalated ? EXIT_KILLED : EXIT_TIMEOUT);
      } else if (forwarded) {
        say(`FAILED: ${label} stopped by ${forwarded}`);
        resolveRun(forwarded === "SIGINT" ? 130 : 143);
      } else if (signal) {
        say(`FAILED: ${label} ended by ${signal}`);
        resolveRun(128 + (signal === "SIGKILL" ? 9 : 15));
      } else {
        resolveRun(code ?? 1);
      }
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      signalGroup(watchdog.pid, "SIGKILL");
      say(`FAILED: could not start ${command}: ${error.message}`);
      resolveRun(1);
    });
  });
}

function nodeEnv(heapMb) {
  const flag = `--max-old-space-size=${heapMb}`;
  const current = process.env.NODE_OPTIONS ?? "";
  const cleaned = current.replace(/--max-old-space-size=\d+/g, "").trim();
  return { ...process.env, NODE_OPTIONS: `${cleaned} ${flag}`.trim() };
}

async function withLock(fn) {
  const lock = acquireLock(join(tmpdir(), "mori-test-run.lock"));
  if (!lock.ok) {
    process.stderr.write(
      `[run-tests] FAILED: another Mori test run is in progress (pid ${lock.holder}); runs never overlap on this machine. Wait for it, do not stop it.\n`,
    );
    return EXIT_LOCKED;
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

async function runVitest(args) {
  const refused = refuseVitestArgs(args);
  if (refused) {
    process.stderr.write(`[run-tests] refused: ${refused}\n`);
    return EXIT_REFUSED;
  }
  const { maxWorkers, heapMb, timeoutS, graceS } = limits();
  const rest = args.filter((arg) => arg !== "run");
  const bin = join(REPO, "node_modules", ".bin", "vitest");
  process.stderr.write(
    `[run-tests] vitest run · workers ${maxWorkers} · heap ${heapMb} MB per process · limit ${timeoutS}s (+${graceS}s grace)\n`,
  );
  return withLock(() =>
    runLimited(bin, ["run", `--maxWorkers=${maxWorkers}`, ...rest], {
      timeoutS,
      graceS,
      env: { ...nodeEnv(heapMb), MORI_TEST_MAX_WORKERS: String(maxWorkers) },
      label: "the Vitest run",
    }),
  );
}

async function runHarness() {
  const { heapMb, timeoutS, graceS } = limits();
  const dir = join(REPO, "scripts", "lib");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".node.mjs"))
    .map((name) => join("scripts", "lib", name));
  return withLock(() =>
    runLimited(process.execPath, ["--test", ...files], {
      timeoutS,
      graceS,
      env: nodeEnv(heapMb),
      label: "the node:test harness",
    }),
  );
}

/**
 * Proves the limits without running a test: the argument rules, a run that
 * overstays its limit (it and a background child must be gone after the
 * grace), and a run that ignores SIGTERM (it must be killed). Sleeps only.
 */
async function selfCheck() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}\n`);
  };

  const refused = [
    ["--root", "/"],
    ["--root=/"],
    ["-r", "/"],
    ["--dir", "/"],
    ["/tmp/x.test.ts"],
    ["../outside.test.ts"],
    ["--config", "/tmp/vitest.config.ts"],
    ["--watch"],
  ];
  for (const args of refused) check(`refuses ${args.join(" ")}`, refuseVitestArgs(args) !== null);
  const accepted = [["run"], ["src/lib/timeline/labelRooms.test.ts"], ["--changed"], ["labelRooms"], ["--config", "vite.config.ts"]];
  for (const args of accepted) check(`accepts ${args.join(" ")}`, refuseVitestArgs(args) === null);

  const sleepers = (script) => ["-c", script];
  const started = Date.now();
  const timeoutCode = await runLimited("bash", sleepers("sleep 61 & sleep 62"), {
    timeoutS: 1,
    graceS: 1,
    env: process.env,
    label: "a sleeping run",
    quiet: true,
  });
  check("an overlong run times out with exit 124", timeoutCode === EXIT_TIMEOUT, `exit ${timeoutCode}, ${Date.now() - started} ms`);
  check("its background child is gone", !hasSleeper("61") && !hasSleeper("62"));

  const ignoreCode = await runLimited("bash", sleepers('trap "" TERM; sleep 63 & sleep 64'), {
    timeoutS: 1,
    graceS: 1,
    env: process.env,
    label: "a run that ignores SIGTERM",
    quiet: true,
  });
  // bash ignores TERM, and so do the sleeps it started (an ignored signal is
  // inherited), so only SIGKILL ends them.
  check("a run ignoring SIGTERM is killed after the grace (exit 137)", ignoreCode === EXIT_KILLED, `exit ${ignoreCode}`);
  check("nothing of it is left", !hasSleeper("63") && !hasSleeper("64"));

  // The wrapper itself SIGKILLed mid-run (what a caller's own timeout may do):
  // the watchdog must still end the run.
  const orphan = spawn(process.execPath, [fileURLToPath(import.meta.url), "self-check-orphan"], {
    stdio: "ignore",
    env: process.env,
  });
  await new Promise((r) => setTimeout(r, 1500));
  check("a sleeping run starts under a wrapper", hasSleeper("65"));
  orphan.kill("SIGKILL");
  const deadlineMs = Date.now() + 8000;
  while (hasSleeper("65") && Date.now() < deadlineMs) await new Promise((r) => setTimeout(r, 250));
  check("after the wrapper is SIGKILLed, the watchdog ends the run", !hasSleeper("65"));

  const lockDir = join(tmpdir(), `mori-test-run.selfcheck-${process.pid}.lock`);
  const first = acquireLock(lockDir);
  const second = acquireLock(lockDir);
  check("a second run is refused while one holds the lock", first.ok && !second.ok);
  if (first.ok) first.release();
  check("the lock is released afterwards", !existsSync(lockDir));

  const failed = results.filter((ok) => !ok).length;
  process.stdout.write(failed === 0 ? "self-check passed\n" : `self-check FAILED: ${failed} check(s)\n`);
  return failed === 0 ? 0 : 1;
}

function hasSleeper(seconds) {
  const out = spawnSync("ps", ["-eo", "comm=,args="], { encoding: "utf8" }).stdout ?? "";
  return out.split("\n").some((line) => /^sleep\s/.test(line) && line.trim().endsWith(`sleep ${seconds}`));
}

async function main() {
  const [mode = "vitest", ...args] = process.argv.slice(2);
  try {
    if (mode === "vitest") return await runVitest(args);
    if (mode === "harness") return await runHarness();
    if (mode === "self-check") return await selfCheck();
    if (mode === "limited") {
      const separator = args.indexOf("--");
      const seconds = Number(args[0]);
      if (separator !== 1 || !Number.isInteger(seconds) || seconds < 1 || args.length < 3) {
        process.stderr.write("[run-tests] usage: limited <seconds> -- <command> [args]\n");
        return EXIT_REFUSED;
      }
      const [command, ...rest] = args.slice(2);
      const { graceS } = limits();
      return await runLimited(command, rest, { timeoutS: seconds, graceS, env: process.env, label: command });
    }
    if (mode === "self-check-orphan") {
      // Only for the self-check: a long sleeping run for it to SIGKILL us under.
      return await runLimited("bash", ["-c", "sleep 65"], { timeoutS: 120, graceS: 1, env: process.env, label: "orphan drill", quiet: true });
    }
  } catch (error) {
    process.stderr.write(`[run-tests] FAILED: ${error.message}\n`);
    return 1;
  }
  process.stderr.write(`[run-tests] unknown mode ${mode}: use vitest, harness or self-check\n`);
  return EXIT_REFUSED;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
