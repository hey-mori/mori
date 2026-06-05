/**
 * Generated-output smoke tests for Windows PowerShell connector wrappers.
 *
 * POSIX wrappers need bash + python3. On Windows, Mori ships PowerShell
 * wrappers as the native path, so these tests exercise that route directly:
 * quotes and non-ASCII text must survive into valid UTF-8 JSONL and then into
 * the Import Review draft boundary.
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ingestConnectorJsonl,
  mergeConnectorCandidatesForReview,
} from "./index";

const CODEX_WRAPPER = join(process.cwd(), "connectors/codex-cli/mori-codex-wrapper.ps1");
const OPENCODE_WRAPPER = join(
  process.cwd(),
  "connectors/opencode-cli/mori-opencode-wrapper.ps1",
);
const CLAUDE_HOOK = join(process.cwd(), "connectors/claude-code/mori-claude-hook.ps1");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mori-wrapper-smoke-"));
  tempRoots.push(root);
  return root;
}

function makeCmdStub(root: string, name: string): string {
  const path = join(root, `${name}.cmd`);
  writeFileSync(path, "@echo off\r\necho stub %*\r\nexit /b 0\r\n");
  return path;
}

function readJsonl(outDir: string): string {
  const files = readdirSync(outDir).filter((file) => file.endsWith(".jsonl"));
  expect(files.length).toBeGreaterThan(0);
  return files.map((file) => readFileSync(join(outDir, file), "utf8")).join("");
}

function assertReviewDraft(jsonl: string, expectedConnectorId: string): void {
  const result = ingestConnectorJsonl({
    text: jsonl,
    projectId: "p-wrapper-smoke",
    sessionId: "s-wrapper-smoke",
  });
  expect(result.outcome.errors).toEqual([]);
  expect(result.outcome.events.length).toBeGreaterThan(0);
  for (const event of result.outcome.events) {
    expect(event.connectorId).toBe(expectedConnectorId);
    expect(event.rawText).toBeUndefined();
  }
  const reviewDraft = mergeConnectorCandidatesForReview(result.candidates);
  expect(reviewDraft).not.toBeNull();
  expect(reviewDraft!.events.length).toBeGreaterThan(0);
  for (const event of reviewDraft!.events) {
    expect(event.connectorEventId).toBeTruthy();
    expect(event.sourceRefs).toContain(reviewDraft!.source.id);
  }
}

function runPowerShell(script: string, args: string[], input?: string): void {
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
    { input, encoding: "utf8" },
  );
}

const SMOKE_TIMEOUT = 60_000;
const describeIfWindows = process.platform === "win32" ? describe : describe.skip;

describeIfWindows("PowerShell connector wrappers", () => {
  it("Codex wrapper emits valid escaped JSONL for quoted / Korean args", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const stub = makeCmdStub(root, "codex-stub");
    runPowerShell(CODEX_WRAPPER, [
      "-Out",
      outDir,
      "-Session",
      'codex-session-"\uD55C\uAE00"',
      stub,
      "run",
      'Fix "quoted" \uD55C\uAD6D\uC5B4 prompt',
    ]);
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"quoted\\"');
    expect(jsonl).toContain("\uD55C\uAD6D\uC5B4");
    assertReviewDraft(jsonl, "codexCliWrapper");
  }, SMOKE_TIMEOUT);

  it("OpenCode wrapper emits valid escaped JSONL for quoted / Korean args", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const stub = makeCmdStub(root, "opencode-stub");
    runPowerShell(OPENCODE_WRAPPER, [
      "-Out",
      outDir,
      "-Session",
      'opencode-session-"\uD55C\uAE00"',
      stub,
      "run",
      'Add retry for "\uC5C5\uB85C\uB4DC" flow',
    ]);
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"\uC5C5\uB85C\uB4DC\\"');
    assertReviewDraft(jsonl, "openCodeCli");
  }, SMOKE_TIMEOUT);

  it("Claude hook launcher maps a synthetic UTF-8 hook payload", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const payload = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: 'claude-session-"\uD55C\uAE00"',
      cwd: root,
      prompt: '\uC694\uC57D\uD574\uC918: "\uC5F0\uB3D9" \uACBD\uACC4\uB97C \uD655\uC778',
    });
    runPowerShell(CLAUDE_HOOK, ["--out", outDir], payload);
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"\uC5F0\uB3D9\\"');
    assertReviewDraft(jsonl, "claudeCodeHook");
  }, SMOKE_TIMEOUT);
});
