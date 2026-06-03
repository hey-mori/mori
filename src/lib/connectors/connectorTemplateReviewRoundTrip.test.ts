/**
 * Round-trip tests for shipped connector template samples at the exact
 * Import Review boundary.
 *
 * The lower-level fixture tests prove parse / preview / normalize. This file
 * pins the final user-visible handoff: JSONL from each shipped template sample
 * must ingest into connector candidates, merge into one Import Review draft
 * when necessary, and preserve per-event connector identities + source
 * provenance. If this fails, the template may still parse but no longer reaches
 * the review-before-apply gate safely.
 */
import { describe, expect, it } from "vitest";
import claudeCodeSample from "../../../connectors/claude-code/sample-event.jsonl?raw";
import codexCliSample from "../../../connectors/codex-cli/sample-event.jsonl?raw";
import localCaptureSample from "../../../connectors/local-capture/sample-event.jsonl?raw";
import mcpSample from "../../../connectors/mcp/sample-event.jsonl?raw";
import openCodeSample from "../../../connectors/opencode-cli/sample-event.jsonl?raw";
import {
  ingestConnectorJsonl,
  mergeConnectorCandidatesForReview,
} from "./index";

const TEMPLATE_SAMPLES = [
  {
    name: "Claude Code hook",
    jsonl: claudeCodeSample,
    expectedSourceKinds: ["claudeTranscript"],
  },
  {
    name: "Codex CLI wrapper",
    jsonl: codexCliSample,
    expectedSourceKinds: ["codexTranscript"],
  },
  {
    name: "OpenCode CLI wrapper",
    jsonl: openCodeSample,
    expectedSourceKinds: ["aiConversation"],
  },
  {
    name: "Local capture bridge",
    jsonl: localCaptureSample,
    expectedSourceKinds: ["aiConversation", "gitDiff", "manualNote"],
  },
  {
    name: "MCP server",
    jsonl: mcpSample,
    expectedSourceKinds: ["aiConversation"],
  },
] as const;

describe("connector template samples → Import Review draft", () => {
  it.each(TEMPLATE_SAMPLES)(
    "$name round-trips through ingest + review merge",
    ({ jsonl, expectedSourceKinds }) => {
      const result = ingestConnectorJsonl({
        text: jsonl,
        projectId: "p-template-review",
        sessionId: "s-template-review",
      });
      expect(result.outcome.errors).toEqual([]);
      expect(result.outcome.events.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.map((candidate) => candidate.source.kind).sort()).toEqual(
        [...expectedSourceKinds].sort(),
      );

      const reviewDraft = mergeConnectorCandidatesForReview(result.candidates);
      expect(reviewDraft).not.toBeNull();
      expect(reviewDraft!.source.sessionId).toBe("s-template-review");
      expect(reviewDraft!.events.length).toBeGreaterThan(0);

      const connectorEventIds = new Set<string>();
      for (const event of reviewDraft!.events) {
        expect(event.createdBy).toBe("import");
        expect(event.connectorEventId).toBeTruthy();
        connectorEventIds.add(event.connectorEventId!);
        expect(event.sourceRefs).toContain(reviewDraft!.source.id);
      }
      expect(connectorEventIds.size).toBe(reviewDraft!.events.length);

      const candidateSourceIds = new Set(result.candidates.map((candidate) => candidate.source.id));
      const eventsStillPointAtOriginalBucket = reviewDraft!.events.some((event) =>
        event.sourceRefs.some((sourceRef) => candidateSourceIds.has(sourceRef)),
      );
      expect(eventsStillPointAtOriginalBucket).toBe(true);
    },
  );
});
