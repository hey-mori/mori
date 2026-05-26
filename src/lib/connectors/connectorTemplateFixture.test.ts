/**
 * Smoke tests for the shipped connector template sample JSONL.
 *
 * `connectors/claude-code/sample-event.jsonl` and
 * `connectors/codex-cli/sample-event.jsonl` are the canonical demo
 * output of the Claude Code hook and Codex CLI wrapper templates. These
 * tests guard the path a user follows after running a template and
 * loading the JSONL into Evidence Hub:
 *
 *   1. The JSONL parses cleanly (no validation errors, no parse errors).
 *   2. The Connector preview surfaces a non-empty valid bucket.
 *   3. Normalization yields the documented source kind and TimelineEvent
 *      types, each event carrying a connector identity.
 *
 * Failing any of these means a template's output no longer matches what
 * the Mori pipeline accepts — fix the template, the sample, or the test.
 */
import { describe, expect, it } from "vitest";
import claudeCodeSample from "../../../connectors/claude-code/sample-event.jsonl?raw";
import codexCliSample from "../../../connectors/codex-cli/sample-event.jsonl?raw";
import {
  buildConnectorJsonlPreview,
  parseConnectorJsonl,
} from "./index";
import { normalizeConnectorEventBatch } from "./normalizeConnectorEvents";

describe("connectors/claude-code/sample-event.jsonl", () => {
  it("parses without validation errors across the typed hook kinds", () => {
    const outcome = parseConnectorJsonl(claudeCodeSample);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events.length).toBe(5);
    for (const event of outcome.events) {
      expect(event.connectorId).toBe("claudeCodeHook");
      expect(event.privacy.captureMethod).toBe("local_hook");
      expect(event.privacy.rawDataPolicy).toBe("summary_only");
      expect(event.provenance.toolName).toBe("mori-claude-hook.py");
      expect(event.rawText).toBeUndefined();
    }
    // Each hook maps to its own typed kind — not the old single placeholder.
    expect(outcome.events.map((event) => event.kind).sort()).toEqual([
      "command_finished",
      "file_changed",
      "prompt_submitted",
      "session_finished",
      "session_started",
    ]);
    // The typed events carry their distinguishing field.
    expect(outcome.events.find((event) => event.kind === "file_changed")?.filePath).toBeTruthy();
    expect(outcome.events.find((event) => event.kind === "command_finished")?.command).toBeTruthy();
  });

  it("previews as a non-empty valid bucket", () => {
    const preview = buildConnectorJsonlPreview(claudeCodeSample);
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBe(5);
    expect(preview.invalidLineCount).toBe(0);
  });

  it("normalizes into one full-fidelity claudeTranscript source", () => {
    const outcome = parseConnectorJsonl(claudeCodeSample);
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-template",
      sessionId: "template-session",
      events: outcome.events,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source.kind).toBe("claudeTranscript");
    // Bracketed by session_started + session_finished → a complete capture.
    expect(candidates[0]?.source.captureFidelity?.level).toBe("full");

    const timelineEvents = candidates.flatMap((candidate) => candidate.events);
    // session_started produces no TimelineEvent; the other four do.
    expect(timelineEvents.map((event) => event.type).sort()).toEqual([
      "aiConversation",
      "documentNote",
      "fileCode",
      "fileCode",
    ]);
    for (const event of timelineEvents) {
      expect(event.connectorEventId).toBeTruthy();
      expect(event.createdBy).toBe("import");
    }
  });
});

describe("connectors/codex-cli/sample-event.jsonl", () => {
  it("parses without validation errors", () => {
    const outcome = parseConnectorJsonl(codexCliSample);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events.length).toBe(3);
    for (const event of outcome.events) {
      expect(event.connectorId).toBe("codexCliWrapper");
      expect(event.privacy.rawDataPolicy).toBe("summary_only");
      expect(event.rawText).toBeUndefined();
    }
  });

  it("previews as a non-empty valid bucket", () => {
    const preview = buildConnectorJsonlPreview(codexCliSample);
    expect(preview.kind).toBe("valid");
    expect(preview.validEventCount).toBe(3);
    expect(preview.invalidLineCount).toBe(0);
  });

  it("normalizes into one codexTranscript source with the documented events", () => {
    const outcome = parseConnectorJsonl(codexCliSample);
    const candidates = normalizeConnectorEventBatch({
      projectId: "p-template",
      sessionId: "template-session",
      events: outcome.events,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source.kind).toBe("codexTranscript");

    const timelineEvents = candidates.flatMap((candidate) => candidate.events);
    // session_started produces no TimelineEvent; command_finished and
    // git_diff_captured both become fileCode events.
    expect(timelineEvents.map((event) => event.type)).toEqual([
      "fileCode",
      "fileCode",
    ]);
    for (const event of timelineEvents) {
      expect(event.connectorEventId).toBeTruthy();
      expect(event.createdBy).toBe("import");
    }
  });
});
