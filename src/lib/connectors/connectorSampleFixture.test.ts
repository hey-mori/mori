/**
 * Smoke test for the documented sample Connector JSONL fixture.
 *
 * The fixture at `docs/fixtures/connector-sample-mori-session.jsonl` is
 * the canonical demo input for the E2E walkthrough in
 * `docs/e2e-smoke-flow.md`. These tests guard the path users follow when
 * they paste that file into Evidence Hub:
 *
 *   1. The JSONL parses cleanly (no validation errors, no parse errors).
 *   2. The Connector preview surfaces a non-empty bucket.
 *   3. The source-level import summary is computed.
 *   4. A second import pass against the same events reports the
 *      duplicate-only / partial state honestly.
 *
 * Failing any of these tests means the documented smoke flow no longer
 * matches reality and the docs are wrong — fix the fixture or the docs.
 */
import { describe, expect, it } from "vitest";
import sampleFixture from "../../../docs/fixtures/connector-sample-mori-session.jsonl?raw";
import {
  applyDuplicateOverlay,
  buildConnectorJsonlPreview,
  buildConnectorSourceImportSummary,
  parseConnectorJsonl,
} from "./index";
import type { MoriMockSession } from "../../domain/types";
import { normalizeConnectorEventBatch } from "./normalizeConnectorEvents";

function loadFixture(): string {
  return sampleFixture;
}

describe("docs/fixtures/connector-sample-mori-session.jsonl", () => {
  it("parses without validation errors", () => {
    const outcome = parseConnectorJsonl(loadFixture());
    expect(outcome.errors).toEqual([]);
    expect(outcome.events.length).toBeGreaterThan(8);
    // Sanity: the fixture should include at least one of each major kind so
    // the smoke flow demonstrates each Timeline candidate type.
    const kinds = new Set(outcome.events.map((event) => event.kind));
    expect(kinds.has("session_started")).toBe(true);
    expect(kinds.has("prompt_submitted")).toBe(true);
    expect(kinds.has("assistant_message")).toBe(true);
    expect(kinds.has("file_changed")).toBe(true);
    expect(kinds.has("command_finished")).toBe(true);
    expect(kinds.has("commit_created")).toBe(true);
  });

  it("produces a non-empty preview with a source import summary", () => {
    const preview = buildConnectorJsonlPreview(loadFixture());
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBeGreaterThan(8);
    expect(preview.invalidLineCount).toBe(0);
    expect(preview.newEventCount).toBe(preview.validEventCount);
    expect(preview.duplicateEventCount).toBe(0);

    const summary = buildConnectorSourceImportSummary(preview);
    // History was not provided in this preview pass — the summary downgrades
    // to historyUnavailable rather than claiming "new across all sessions".
    expect(["new", "historyUnavailable"]).toContain(summary.status);
    expect(summary.totalValidEvents).toBe(preview.validEventCount);
    expect(summary.duplicateEventCount).toBe(0);
  });

  it("normalizes into TimelineEvent candidates with stable connector identities", () => {
    const outcome = parseConnectorJsonl(loadFixture());
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-sample",
      sessionId: "sample-session",
      events: outcome.events,
    });
    expect(candidates.length).toBeGreaterThan(0);
    const eventsFlat = candidates.flatMap((candidate) => candidate.events);
    // session_started events do not produce TimelineEvents (they become the
    // source label), so the count is N-(session_started count).
    const sessionStartedCount = outcome.events.filter((event) => event.kind === "session_started").length;
    expect(eventsFlat.length).toBe(outcome.events.length - sessionStartedCount);
    for (const event of eventsFlat) {
      expect(event.connectorEventId).toBeTruthy();
    }
    // No duplicate identities in a clean parse of the fixture.
    const ids = new Set(eventsFlat.map((event) => event.connectorEventId));
    expect(ids.size).toBe(eventsFlat.length);
  });

  it("re-import against an active session that already holds the events flips to duplicate-only", () => {
    const outcome = parseConnectorJsonl(loadFixture());
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-sample",
      sessionId: "sample-session",
      events: outcome.events,
    });
    const persistedEvents = candidates.flatMap((candidate) => candidate.events);
    const fakeSession: MoriMockSession = {
      project: {
        id: "p-sample",
        name: "Mori sample",
        description: "",
        createdAt: "2026-05-14T09:00:00Z",
        updatedAt: "2026-05-14T09:00:00Z",
      },
      session: {
        id: "sample-session",
        projectId: "p-sample",
        title: "Sample session",
        startedAt: "2026-05-14T09:00:00Z",
        endedAt: "2026-05-14T09:15:00Z",
        recordingMode: "summary",
        llmProvider: "ollama",
        llmModel: "llama3.1:8b",
        storageLocation: "~/Mori/Records",
        selectedSourceIds: [],
        status: "complete",
      },
      sources: candidates.map((candidate) => candidate.source),
      events: persistedEvents,
      issues: [],
      decisions: [],
      relationships: [],
      artifacts: [],
      nextActions: [],
      summary: {
        id: "summary-sample",
        sessionId: "sample-session",
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-05-14T09:15:00Z",
      },
    };
    // First pass had zero duplicates. Now overlay against the session that
    // owns the same identities and the preview should classify every event
    // that produced a TimelineEvent (session_started doesn't) as duplicate.
    const preview = buildConnectorJsonlPreview(loadFixture());
    const sessionStartedCount = outcome.events.filter((event) => event.kind === "session_started").length;
    const expectedDuplicates = preview.validEventCount - sessionStartedCount;
    const overlaid = applyDuplicateOverlay(preview, fakeSession);
    expect(overlaid.newEventCount).toBe(sessionStartedCount);
    expect(overlaid.duplicateEventCount).toBe(expectedDuplicates);
    expect(overlaid.currentSessionDuplicateCount).toBe(expectedDuplicates);

    const summary = buildConnectorSourceImportSummary(overlaid);
    // With session_started still "new" the source is a partial re-import,
    // which honestly matches user expectation: the file has one row Mori
    // wouldn't have on disk yet (the session marker).
    expect(["partialReimport", "duplicateOnly"]).toContain(summary.status);
  });
});
