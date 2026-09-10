#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcTauri = join(root, "src-tauri");
const hostName = "mori-browser-native-host";
const targetTriple = resolveTargetTriple();
const exe = process.platform === "win32" ? ".exe" : "";
const source = join(srcTauri, "target", targetTriple, "release", `${hostName}${exe}`);
const fallbackSource = join(srcTauri, "target", "release", `${hostName}${exe}`);
const target = join(srcTauri, "binaries", `${hostName}-${targetTriple}${exe}`);

ensureExternalBinPlaceholder();
run("cargo", cargoArgs(), { cwd: srcTauri });

const builtHost = existsSync(source) ? source : fallbackSource;
if (!existsSync(builtHost)) {
  throw new Error(`Native host build did not create ${source}`);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(builtHost, target);
const mode = statSync(builtHost).mode;
try {
  rmSync(join(srcTauri, "binaries", `${hostName}${exe}`), { force: true });
} catch {
  // Best effort cleanup of an old unsuffixed local binary.
}
process.stdout.write(`Prepared ${target} (${mode.toString(8)})\n`);

function cargoArgs() {
  const args = ["build", "--release", "--bin", hostName];
  if (process.env.CARGO_BUILD_TARGET) {
    args.push("--target", process.env.CARGO_BUILD_TARGET);
  }
  return args;
}

function ensureExternalBinPlaceholder() {
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "");
}

function resolveTargetTriple() {
  if (process.env.CARGO_BUILD_TARGET) return process.env.CARGO_BUILD_TARGET;
  const output = spawnSync("rustc", ["-vV"], {
    cwd: srcTauri,
    encoding: "utf8",
    windowsHide: true,
  });
  if (output.status !== 0) {
    throw new Error(`rustc -vV failed:\n${output.stderr || output.stdout}`);
  }
  const hostLine = output.stdout.split(/\r?\n/).find((line) => line.startsWith("host: "));
  const host = hostLine?.slice("host: ".length).trim();
  if (!host) throw new Error("rustc -vV did not report a host target triple.");
  return host;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
