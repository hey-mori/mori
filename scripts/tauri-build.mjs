#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  renderNsisHooks,
  renderTauriConfig,
  resolveAllowedOriginsFromEnv,
} from "./lib/browser-native-host-packaging.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const generatedDir = join(root, "src-tauri", "target", "mori-browser-native-host");
const hookPath = join(generatedDir, "browser-native-host.nsh");
const configPath = join(generatedDir, "tauri.browser-native.conf.json");
const tauriArgs = process.argv.slice(2);

if (tauriArgs.includes("--help") || tauriArgs.includes("-h")) {
  run("node", [tauriCli, "build", ...tauriArgs], { cwd: root });
  process.exit(0);
}

const origins = resolveAllowedOriginsFromEnv();

mkdirSync(generatedDir, { recursive: true });
writeFileSync(hookPath, renderNsisHooks(origins), "utf8");
writeFileSync(
  configPath,
  `${JSON.stringify(renderTauriConfig(hookPath), null, 2)}\n`,
  "utf8",
);

run("node", [join(root, "scripts", "prepare-browser-native-host.mjs")], { cwd: root });
run("node", [tauriCli, "build", "--config", configPath, ...tauriArgs], { cwd: root });

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${detail}`);
  }
}
