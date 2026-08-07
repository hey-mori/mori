/**
 * Generated-output smoke test for `connectors/local-capture/mori-local-capture.py`.
 *
 * The checked-in sample fixture guards the schema shape. This test guards the
 * script itself: given explicit temp inputs, it writes Connector JSONL that
 * parses, normalizes, and reaches the Import Review draft boundary.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
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

const SCRIPT = join(process.cwd(), "connectors/local-capture/mori-local-capture.py");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mori-local-capture-"));
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


describe("mori-local-capture.py generated output", () => {
  it("emits explicit transcript, note, and git metadata that reach an Import Review draft", () => {
    const root = makeTempRoot();
    const outDir = join(root, "out");
    const repo = join(root, "repo");
    const transcript = join(root, "claude-session.txt");
    mkdirSync(repo, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      transcript,
      [
        "User: summarize this connector plan",
        "Assistant: keep capture explicit and review-gated",
      ].join("\n"),
    );

    run("git", ["init"], repo);
    run("git", ["config", "user.name", "Mori Test"], repo);
    run("git", ["config", "user.email", "mori@example.test"], repo);
    writeFileSync(join(repo, "README.md"), "initial\n");
    run("git", ["add", "README.md"], repo);
    run("git", ["commit", "-m", "initial"], repo);
    writeFileSync(join(repo, "README.md"), "initial\nchanged\n");

    const stdout = run("python3", [
      SCRIPT,
      "--transcript",
      transcript,
      "--note",
      "Generated smoke test: local capture stays explicit.",
      "--git-repo",
      repo,
      "--out",
      outDir,
      "--session",
      "generated-smoke-session",
    ]);
    expect(stdout).toContain("wrote 3 event(s)");

    const files = readdirSync(outDir).filter((file) => file.endsWith(".jsonl"));
    expect(files).toHaveLength(1);
    const jsonl = readFileSync(join(outDir, files[0]), "utf8");

    const result = ingestConnectorJsonl({
      text: jsonl,
      projectId: "p-generated-smoke",
      sessionId: "s-generated-smoke",
    });
    expect(result.outcome.errors).toEqual([]);
    expect(result.outcome.events).toHaveLength(3);
    expect(result.outcome.events.map((event) => event.kind).sort()).toEqual([
      "git_diff_captured",
      "session_finished",
      "transcript_imported",
    ]);
    for (const event of result.outcome.events) {
      expect(event.rawText).toBeUndefined();
      expect(event.privacy.captureMethod).toBe("local_cli_wrapper");
      expect(event.privacy.rawDataPolicy).toBe("summary_only");
    }

    const gitEvent = result.outcome.events.find(
      (event) => event.kind === "git_diff_captured",
    );
    expect(gitEvent?.git?.repoPath).toBeUndefined();
    expect(gitEvent?.git?.isDirty).toBe(true);
    expect(gitEvent?.git?.files?.map((file) => file.path)).toEqual(["README.md"]);

    expect(result.candidates.map((candidate) => candidate.source.kind).sort()).toEqual([
      "aiConversation",
      "gitDiff",
      "manualNote",
    ]);
    const reviewDraft = mergeConnectorCandidatesForReview(result.candidates);
    expect(reviewDraft).not.toBeNull();
    expect(reviewDraft!.events).toHaveLength(3);
    for (const event of reviewDraft!.events) {
      expect(event.createdBy).toBe("import");
      expect(event.connectorEventId).toBeTruthy();
      expect(event.sourceRefs).toContain(reviewDraft!.source.id);
    }
  });
});
