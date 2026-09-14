#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateBrowserRepeatRuns } from "./lib/browser-repeat-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}

const runs = Number(option("--runs", "20"));
const observations = Number(option("--observations", "20"));
const historyEvery = Number(option("--history-every", "0"));
const matrix = option("--matrix", "fresh-runtime");
const outputOption = option("--output");
const output = path.resolve(
  outputOption || mkdtempSync(path.join(os.tmpdir(), "mori-browser-repeat-")),
);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 30, "invalid run count");
assert.match(matrix, /^[a-z0-9][a-z0-9-]*$/i, "invalid matrix name");
assert.ok(
  Number.isInteger(historyEvery) && historyEvery >= 0 && historyEvery <= runs,
  "invalid history interval",
);
mkdirSync(output, { recursive: true });

const reports = [];
const exitStatuses = [];
for (let index = 1; index <= runs; index++) {
  const runId = `${matrix}-${String(index).padStart(2, "0")}`;
  const childArgs = [
    path.join(root, "scripts/browser-live-smoke.mjs"),
    "--run-id",
    runId,
    "--matrix",
    matrix,
    "--observations",
    String(observations),
    "--spa",
  ];
  for (const name of [
    "--mori-exe",
    "--host-exe",
    "--extension-repo",
    "--webview-port",
    "--chrome-profile",
    "--webview-profile",
    "--home",
  ]) {
    if (args.includes(name)) childArgs.push(name, option(name));
  }
  if (args.includes("--leave-capture-off")) childArgs.push("--leave-capture-off");
  if (args.includes("--core")) childArgs.push("--core");
  if (historyEvery > 0 && index % historyEvery === 0) childArgs.push("--history");

  console.error(`[browser-repeat] ${runId}: starting`);
  const child = spawnSync(process.execPath, childArgs, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 6 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = child.status ?? 1;
  let report;
  try {
    report = JSON.parse(child.stdout);
  } catch (error) {
    report = {
      runId,
      matrix,
      failures: [`report parse: ${error.message || error}`],
      failureCategory: child.error?.code === "ETIMEDOUT" ? "harness_timeout" : "harness_report",
      stderr: String(child.stderr || "").slice(-4000),
    };
  }
  reports.push(report);
  exitStatuses.push(status);
  writeFileSync(
    path.join(output, `${runId}.json`),
    JSON.stringify({ exitStatus: status, report, stderr: child.stderr }, null, 2),
  );
  console.error(
    `[browser-repeat] ${runId}: ${status === 0 && report.cleanup?.pass ? "passed" : "failed"}`,
  );
}

const aggregate = aggregateBrowserRepeatRuns({ matrix, reports, exitStatuses });
const result = { output, ...aggregate };
writeFileSync(path.join(output, "aggregate.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.failedRuns > 0) process.exitCode = 1;
