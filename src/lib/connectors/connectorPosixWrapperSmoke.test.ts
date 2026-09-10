/**
 * Generated-output smoke tests for POSIX connector wrappers.
 *
 * These tests run the shell wrappers with stub agent binaries / synthetic hook
 * payloads, including quotes + Korean text, then parse the generated JSONL and
 * assert it reaches the Import Review draft boundary. They intentionally avoid
 * invoking real Claude, Codex, or OpenCode.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
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

const CODEX_WRAPPER = join(process.cwd(), "connectors/codex-cli/mori-codex-wrapper.sh");
const OPENCODE_WRAPPER = join(
  process.cwd(),
  "connectors/opencode-cli/mori-opencode-wrapper.sh",
);
const CLAUDE_HOOK = join(process.cwd(), "connectors/claude-code/mori-claude-hook.sh");
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

function makeStub(root: string, name: string): string {
  const path = join(root, name);
  writeFileSync(path, "#!/usr/bin/env bash\nprintf 'stub %s\\n' \"$*\"\nexit 0\n");
  chmodSync(path, 0o755);
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

function bashPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (isWslBashRuntime()) {
    const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
    if (match) return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
  }
  return normalized;
}

let cachedIsWslBashRuntime: boolean | null = null;

function isWslBashRuntime(): boolean {
  if (cachedIsWslBashRuntime !== null) return cachedIsWslBashRuntime;
  try {
    const release = execFileSync("bash", ["-c", "uname -r"], {
      encoding: "utf8",
    });
    cachedIsWslBashRuntime = /microsoft|wsl/i.test(release);
  } catch {
    cachedIsWslBashRuntime = false;
  }
  return cachedIsWslBashRuntime;
}

/**
 * Whether a POSIX runtime is usable, decided without a login shell.
 *
 * This used `bash -lc`. The `-l` sources the full profile, which costs ~2.3s
 * against ~0.1s for `bash -c` on this platform, a 20x difference for a check
 * that only needs to answer "is python3 on PATH". Profile sourcing is also
 * heavily file-bound, so it degrades worst under exactly the disk contention
 * that made the suite flake. `bash -c` resolves both `python3` and `git` here,
 * because the interpreter is on the inherited PATH rather than something the
 * profile adds.
 */
function hasUsablePosixRuntime(): boolean {
  try {
    execFileSync("bash", ["-c", "command -v python3 >/dev/null && python3 --version >/dev/null"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const describeIfPosix = hasUsablePosixRuntime() ? describe : describe.skip;

describeIfPosix("POSIX connector wrappers", () => {
  it("Codex wrapper emits valid escaped JSONL for quoted / Korean args", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const stub = makeStub(root, "codex-stub");
    execFileSync("bash", [
      bashPath(CODEX_WRAPPER),
      "--out",
      bashPath(outDir),
      "--session",
      'codex-session-"한글"',
      "--",
      bashPath(stub),
      "run",
      'Fix "quoted" 한국어 prompt',
    ]);
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"quoted\\"');
    expect(jsonl).toContain("한국어");
    assertReviewDraft(jsonl, "codexCliWrapper");
  });

  it("OpenCode wrapper emits valid escaped JSONL for quoted / Korean args", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const stub = makeStub(root, "opencode-stub");
    execFileSync("bash", [
      bashPath(OPENCODE_WRAPPER),
      "--out",
      bashPath(outDir),
      "--session",
      'opencode-session-"한글"',
      "--",
      bashPath(stub),
      "run",
      'Add retry for "업로드" flow',
    ]);
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"업로드\\"');
    assertReviewDraft(jsonl, "openCodeCli");
  });

  it("Claude hook launcher maps a synthetic UTF-8 hook payload", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const payload = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: 'claude-session-"한글"',
      cwd: root,
      prompt: '요약해줘: "연동" 경계를 확인',
    });
    execFileSync("bash", [bashPath(CLAUDE_HOOK), "--out", bashPath(outDir)], {
      input: payload,
      encoding: "utf8",
    });
    const jsonl = readJsonl(outDir);
    expect(jsonl).toContain('\\"연동\\"');
    assertReviewDraft(jsonl, "claudeCodeHook");
  });
});
