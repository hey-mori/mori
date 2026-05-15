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
 */
import { describe, expect, it } from "vitest";
import localCaptureSample from "../../../connectors/local-capture/sample-event.jsonl?raw";
import {
  buildConnectorJsonlPreview,
  buildConnectorSourceImportSummary,
  parseConnectorJsonl,
} from "./index";
import { normalizeConnectorEventBatch } from "./normalizeConnectorEvents";

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
