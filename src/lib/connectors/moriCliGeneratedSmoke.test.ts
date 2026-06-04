/**
 * Generated-output smoke test for the minimal `mori capture` CLI.
 *
 * The CLI delegates to mori-local-capture.py, but this test guards the new
 * user-facing entrypoint and proves it still emits Connector JSONL that reaches
 * the Import Review draft boundary.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ingestConnectorJsonl,
  mergeConnectorCandidatesForReview,
} from "./index";

const MORI_CLI = join(process.cwd(), "connectors/mori-cli/mori.py");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mori-cli-smoke-"));
  tempRoots.push(root);
  return root;
}

function run(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Mori Test",
      GIT_AUTHOR_EMAIL: "mori@example.test",
      GIT_COMMITTER_NAME: "Mori Test",
      GIT_COMMITTER_EMAIL: "mori@example.test",
    },
  });
}

function makeStub(root: string, name: string): string {
  const path = join(root, name);
  writeFileSync(path, "#!/usr/bin/env bash\nprintf 'stub %s\\n' \"$*\"\nexit 0\n");
  chmodSync(path, 0o755);
  return path;
}

// These smoke tests spawn many real git / python3 subprocesses; subprocess
// startup is slow on Windows, so a generous timeout avoids flaky timeouts
// under parallel load.
const SMOKE_TIMEOUT = 60_000;
// Some cases exercise POSIX-only execution (a PATH symlink, a bash-shebang
// stub) that cannot run on Windows; skip them there rather than fail.
const POSIX_ONLY = process.platform === "win32" ? it.skip : it;

describe("mori capture CLI", () => {
  POSIX_ONLY("can be invoked through a mori symlink on PATH", () => {
    const root = makeTempRoot();
    const bin = join(root, "bin");
    const outDir = join(root, "out");
    mkdirSync(bin, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    symlinkSync(MORI_CLI, join(bin, "mori"));

    execFileSync("mori", [
      "capture",
      "note",
      "Invoked through PATH symlink",
      "--out",
      outDir,
      "--session",
      "mori-symlink-smoke",
    ], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });

    const jsonl = readdirSync(outDir)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => readFileSync(join(outDir, file), "utf8"))
      .join("");
    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "p-mori-cli",
      sessionId: "s-mori-cli",
    });
    expect(result.outcome.errors).toEqual([]);
    expect(result.outcome.events).toHaveLength(1);
    expect(result.outcome.events[0]?.kind).toBe("session_finished");
  }, SMOKE_TIMEOUT);

  POSIX_ONLY("runs Codex and OpenCode commands through bundled wrappers", () => {
    const root = makeTempRoot();
    const codexOut = join(root, "codex-out");
    const openCodeOut = join(root, "opencode-out");
    mkdirSync(codexOut, { recursive: true });
    mkdirSync(openCodeOut, { recursive: true });
    const codexStub = makeStub(root, "codex-stub");
    const openCodeStub = makeStub(root, "opencode-stub");

    run("python3", [
      MORI_CLI,
      "run",
      "--connector",
      "codex",
      "--out",
      codexOut,
      "--session",
      'mori-run-codex-"한글"',
      "--",
      codexStub,
      "run",
      'Fix "quoted" prompt',
    ]);
    run("python3", [
      MORI_CLI,
      "run",
      "--connector",
      "opencode",
      "--out",
      openCodeOut,
      "--session",
      'mori-run-opencode-"한글"',
      "--",
      openCodeStub,
      "run",
      'Add "업로드" retry',
    ]);

    const codexJsonl = readdirSync(codexOut)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => readFileSync(join(codexOut, file), "utf8"))
      .join("");
    const openCodeJsonl = readdirSync(openCodeOut)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => readFileSync(join(openCodeOut, file), "utf8"))
      .join("");

    const codex = ingestConnectorJsonl({
      text: codexJsonl,
      projectId: "p-mori-cli",
      sessionId: "s-mori-cli",
    });
    expect(codex.outcome.errors).toEqual([]);
    expect(codex.outcome.events.map((event) => event.connectorId)).toEqual([
      "codexCliWrapper",
      "codexCliWrapper",
    ]);

    const openCode = ingestConnectorJsonl({
      text: openCodeJsonl,
      projectId: "p-mori-cli",
      sessionId: "s-mori-cli",
    });
    expect(openCode.outcome.errors).toEqual([]);
    expect(openCode.outcome.events.map((event) => event.connectorId)).toEqual([
      "openCodeCli",
      "openCodeCli",
      "openCodeCli",
      "openCodeCli",
    ]);

    expect(mergeConnectorCandidatesForReview(codex.candidates)?.events.length).toBe(1);
    expect(mergeConnectorCandidatesForReview(openCode.candidates)?.events.length).toBe(3);
  }, SMOKE_TIMEOUT);

  it("captures note, transcript, git, and commit commands into reviewable Connector JSONL", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const repo = join(root, "repo");
    const transcript = join(root, "session.txt");
    mkdirSync(outDir, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(transcript, "User: CLI smoke\nAssistant: JSONL looks good\n");

    run("git", ["init"], repo);
    run("git", ["config", "user.name", "Mori Test"], repo);
    run("git", ["config", "user.email", "mori@example.test"], repo);
    writeFileSync(join(repo, "README.md"), "initial\n");
    run("git", ["add", "README.md"], repo);
    run("git", ["commit", "-m", "initial"], repo);
    writeFileSync(join(repo, "README.md"), "initial\nchanged\n");

    const common = ["--out", outDir, "--session", "mori-cli-smoke"];
    run("python3", [
      MORI_CLI,
      "capture",
      "note",
      "CLI wrapper keeps review-before-apply",
      ...common,
    ]);
    run("python3", [
      MORI_CLI,
      "capture",
      "transcript",
      transcript,
      ...common,
    ]);
    run("python3", [
      MORI_CLI,
      "capture",
      "git",
      "--repo",
      repo,
      ...common,
    ]);
    run("python3", [
      MORI_CLI,
      "capture",
      "commit",
      "HEAD",
      "--repo",
      repo,
      ...common,
    ]);

    const jsonl = readdirSync(outDir)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => readFileSync(join(outDir, file), "utf8"))
      .join("");
    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "p-mori-cli",
      sessionId: "s-mori-cli",
    });

    expect(result.outcome.errors).toEqual([]);
    expect(result.outcome.events.map((event) => event.kind).sort()).toEqual([
      "git_diff_captured",
      "git_diff_captured",
      "session_finished",
      "transcript_imported",
    ]);
    expect(result.candidates.map((candidate) => candidate.source.kind).sort()).toEqual([
      "aiConversation",
      "gitDiff",
      "manualNote",
    ]);

    const reviewDraft = mergeConnectorCandidatesForReview(result.candidates);
    expect(reviewDraft).not.toBeNull();
    expect(reviewDraft!.events).toHaveLength(4);
    for (const event of reviewDraft!.events) {
      expect(event.connectorEventId).toBeTruthy();
      expect(event.sourceRefs).toContain(reviewDraft!.source.id);
    }
  }, SMOKE_TIMEOUT);
});
