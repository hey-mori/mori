/**
 * Smoke test for the local-capture connector sample JSONL.
 *
 * The sample at `connectors/local-capture/sample-event.jsonl` is the
 * canonical demo input for the Local Connector Capture Bridge — it is the
 * exact event shape `connectors/local-capture/mori-local-capture.py`
 * produces for its three explicit inputs (`--transcript`, `--note`,
 * `--git-repo`). These tests guard the path a real user follows when they
 * run the script and then load the JSONL into Evidence Hub:
 *
 *   1. The JSONL parses cleanly (no validation errors, no parse errors).
 *   2. The three inputs map to the three documented connector event kinds.
 *   3. The Connector preview surfaces a non-empty valid bucket.
 *   4. Normalization yields one SourceRef per input with the documented
 *      source kind + TimelineEvent type, each carrying a connector identity.
 *
 * Failing any of these means the script output no longer matches what the
 * Mori pipeline accepts — fix the script, the sample, or this test together.
 *
 * The sample's git event covers a *dirty* repo (populated `git.files`).
 * `mori-local-capture.py` also emits a *clean* repo snapshot — `isDirty:
 * false`, empty `git.files`, zero additions / deletions — which the
 * dedicated block below guards so a real clean-repo capture is verified
 * to round-trip through the connector pipeline too.
 *
 * `mori-local-capture.py --transcript -` reads a piped CLI session from
 * stdin (`claude ... | mori-local-capture --transcript -`). Its event
 * shape matches a file transcript except `sourceTitle` is `Transcript:
 * stdin` and `occurredAt` equals `receivedAt` (stdin has no mtime). The
 * final block guards that a stdin capture round-trips too.
 */
import { describe, expect, it } from "vitest";
import localCaptureSample from "../../../connectors/local-capture/sample-event.jsonl?raw";
import {
  buildConnectorJsonlPreview,
  buildConnectorSourceImportSummary,
  parseConnectorJsonl,
} from "./index";
import { normalizeConnectorEventBatch } from "./normalizeConnectorEvents";

/**
 * The exact line `mori-local-capture.py --git-repo <clean repo>` emits:
 * a `git_diff_captured` event with `isDirty: false` and an empty
 * `git.files` array. Ids / SHA are synthetic.
 */
const CLEAN_REPO_GIT_JSONL = JSON.stringify({
  id: "local-20260516T090000Z-git",
  connectorId: "gitCommand",
  kind: "git_diff_captured",
  occurredAt: "2026-05-16T09:00:00Z",
  receivedAt: "2026-05-16T09:00:00Z",
  sessionId: "local-20260516T090000Z",
  sourceTitle: "Git snapshot: sample-repo",
  summary: "Git snapshot · branch main · HEAD 0000000 · clean · 0 files changed (+0 / -0)",
  git: {
    branch: "main",
    headCommit: "0000000000000000000000000000000000000000",
    shortHeadCommit: "0000000",
    isDirty: false,
    additions: 0,
    deletions: 0,
    files: [],
  },
  privacy: {
    captureMethod: "local_cli_wrapper",
    rawDataPolicy: "summary_only",
    redacted: false,
    note: "Local capture CLI. Git metadata only — no diff content, no file contents, no absolute repository path.",
  },
  provenance: { toolName: "mori-local-capture.py", toolVersion: "0.1.0" },
});

/**
 * The exact line `mori-local-capture.py --transcript -` emits for a
 * piped CLI session: a `transcript_imported` event whose `sourceTitle`
 * is `Transcript: stdin` and whose `occurredAt` equals `receivedAt`.
 */
const STDIN_TRANSCRIPT_JSONL = JSON.stringify({
  id: "local-20260516T093000Z-transcript",
  connectorId: "desktopTranscriptImport",
  kind: "transcript_imported",
  occurredAt: "2026-05-16T09:30:00Z",
  receivedAt: "2026-05-16T09:30:00Z",
  sessionId: "local-20260516T093000Z",
  sourceTitle: "Transcript: stdin",
  summary:
    "Imported transcript stdin (3 lines). First line: User: hello claude",
  privacy: {
    captureMethod: "local_cli_wrapper",
    rawDataPolicy: "summary_only",
    redacted: false,
    note: "Local capture CLI. Transcript piped from stdin by the user; full text is not stored — summary metadata only.",
  },
  provenance: { toolName: "mori-local-capture.py", toolVersion: "0.1.0" },
});

describe("connectors/local-capture/sample-event.jsonl", () => {
  it("parses without validation errors and covers all three inputs", () => {
    const outcome = parseConnectorJsonl(localCaptureSample);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events.length).toBe(3);

    const kinds = outcome.events.map((event) => event.kind).sort();
    expect(kinds).toEqual(["git_diff_captured", "session_finished", "transcript_imported"]);

    // Every event declares an explicit, local, summary-only privacy boundary.
    for (const event of outcome.events) {
      expect(event.privacy.captureMethod).toBe("local_cli_wrapper");
      expect(event.privacy.rawDataPolicy).toBe("summary_only");
      expect(event.provenance.toolName).toBe("mori-local-capture.py");
      // The script never emits raw transcript / diff payloads.
      expect(event.rawText).toBeUndefined();
    }
  });

  it("captures git metadata only — no diff content, no absolute repo path", () => {
    const outcome = parseConnectorJsonl(localCaptureSample);
    const gitEvent = outcome.events.find((event) => event.kind === "git_diff_captured");
    expect(gitEvent).toBeDefined();
    expect(gitEvent?.git?.branch).toBeTruthy();
    expect(gitEvent?.git?.shortHeadCommit).toBeTruthy();
    expect(gitEvent?.git?.files?.length).toBeGreaterThan(0);
    // repoPath is intentionally omitted so no absolute local path leaks.
    expect(gitEvent?.git?.repoPath).toBeUndefined();
    // Changed files carry relative paths only — never absolute.
    for (const file of gitEvent?.git?.files ?? []) {
      expect(file.path.startsWith("/")).toBe(false);
    }
  });

  it("produces a non-empty preview with a source import summary", () => {
    const preview = buildConnectorJsonlPreview(localCaptureSample);
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBe(3);
    expect(preview.invalidLineCount).toBe(0);

    const summary = buildConnectorSourceImportSummary(preview);
    expect(summary.totalValidEvents).toBe(3);
  });

  it("normalizes into one SourceRef per input with the documented mappings", () => {
    const outcome = parseConnectorJsonl(localCaptureSample);
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-local-capture",
      sessionId: "local-capture-session",
      events: outcome.events,
    });
    // Three connector ids -> three buckets -> three sources.
    expect(candidates.length).toBe(3);

    const sourceKinds = candidates.map((candidate) => candidate.source.kind).sort();
    expect(sourceKinds).toEqual(["aiConversation", "gitDiff", "manualNote"]);

    const timelineEvents = candidates.flatMap((candidate) => candidate.events);
    // session_started is the only kind that produces no TimelineEvent; this
    // sample has none, so all three events become timeline candidates.
    expect(timelineEvents.length).toBe(3);

    const eventTypes = timelineEvents.map((event) => event.type).sort();
    expect(eventTypes).toEqual(["aiConversation", "documentNote", "fileCode"]);

    for (const event of timelineEvents) {
      expect(event.connectorEventId).toBeTruthy();
      expect(event.createdBy).toBe("import");
    }
    // No duplicate connector identities in a clean parse of the sample.
    const ids = new Set(timelineEvents.map((event) => event.connectorEventId));
    expect(ids.size).toBe(timelineEvents.length);
  });
});

describe("local-capture clean-repo git snapshot", () => {
  it("parses a clean-repo git event with no validation errors", () => {
    const outcome = parseConnectorJsonl(CLEAN_REPO_GIT_JSONL);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events).toHaveLength(1);
    const event = outcome.events[0];
    expect(event?.kind).toBe("git_diff_captured");
    expect(event?.git?.isDirty).toBe(false);
    expect(event?.git?.files).toEqual([]);
  });

  it("previews a clean-repo git snapshot as one valid event", () => {
    const preview = buildConnectorJsonlPreview(CLEAN_REPO_GIT_JSONL);
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBe(1);
    expect(preview.invalidLineCount).toBe(0);
  });

  it("normalizes a clean-repo git event into one gitDiff fileCode candidate", () => {
    const outcome = parseConnectorJsonl(CLEAN_REPO_GIT_JSONL);
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-local-capture",
      sessionId: "local-capture-session",
      events: outcome.events,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source.kind).toBe("gitDiff");

    const timelineEvents = candidates.flatMap((candidate) => candidate.events);
    expect(timelineEvents).toHaveLength(1);
    expect(timelineEvents[0]?.type).toBe("fileCode");
    expect(timelineEvents[0]?.connectorEventId).toBeTruthy();
  });
});

describe("local-capture stdin transcript capture", () => {
  it("parses a stdin transcript event with no validation errors", () => {
    const outcome = parseConnectorJsonl(STDIN_TRANSCRIPT_JSONL);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events).toHaveLength(1);
    const event = outcome.events[0];
    expect(event?.kind).toBe("transcript_imported");
    // stdin has no mtime, so the capture time is the receive time.
    expect(event?.occurredAt).toBe(event?.receivedAt);
    // The script never stores the piped transcript text itself.
    expect(event?.rawText).toBeUndefined();
    expect(event?.privacy.rawDataPolicy).toBe("summary_only");
  });

  it("previews a stdin transcript as one valid event", () => {
    const preview = buildConnectorJsonlPreview(STDIN_TRANSCRIPT_JSONL);
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBe(1);
    expect(preview.invalidLineCount).toBe(0);
  });

  it("normalizes a stdin transcript into one aiConversation candidate", () => {
    const outcome = parseConnectorJsonl(STDIN_TRANSCRIPT_JSONL);
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-local-capture",
      sessionId: "local-capture-session",
      events: outcome.events,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source.kind).toBe("aiConversation");

    const timelineEvents = candidates.flatMap((candidate) => candidate.events);
    expect(timelineEvents).toHaveLength(1);
    expect(timelineEvents[0]?.type).toBe("aiConversation");
    expect(timelineEvents[0]?.connectorEventId).toBeTruthy();
  });
});
