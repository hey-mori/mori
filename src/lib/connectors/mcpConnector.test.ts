/**
 * Smoke test for the MCP connector capture path.
 *
 * The MCP server template (`connectors/mcp/mori-mcp-server.py`) writes connector
 * events with `connectorId: "mcpServer"` and `privacy.captureMethod: "local_mcp"`.
 * These tests guard that those events flow through the same parse → validate →
 * normalize pipeline as every other connector, landing as AI-conversation
 * evidence. The sample file is the exact shape the server emits, so a drift in
 * either the schema or the template fails here.
 */
import { describe, expect, it } from "vitest";
import sampleMcp from "../../../connectors/mcp/sample-event.jsonl?raw";
import { parseConnectorJsonl } from "./index";
import { normalizeConnectorEventBatch } from "./normalizeConnectorEvents";

describe("connectors/mcp/sample-event.jsonl", () => {
  it("parses without validation errors and carries the local_mcp method", () => {
    const outcome = parseConnectorJsonl(sampleMcp);
    expect(outcome.errors).toEqual([]);
    expect(outcome.events.length).toBe(2);
    for (const event of outcome.events) {
      expect(event.connectorId).toBe("mcpServer");
      expect(event.privacy.captureMethod).toBe("local_mcp");
      expect(event.privacy.rawDataPolicy).toBe("summary_only");
    }
  });

  it("normalizes MCP events into an AI-conversation source", () => {
    const outcome = parseConnectorJsonl(sampleMcp);
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "sess-1",
      events: outcome.events,
    });
    expect(candidates.length).toBeGreaterThan(0);
    // Both sample events share one (connectorId, sessionId) tuple, so they fold
    // into a single MCP capture source.
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.source.kind).toBe("aiConversation");
    expect(candidate.source.title.length).toBeGreaterThan(0);
  });

  it("stamps a stable connectorEventId on every normalized event", () => {
    const outcome = parseConnectorJsonl(sampleMcp);
    const candidates = normalizeConnectorEventBatch({
      projectId: "proj-1",
      sessionId: "sess-1",
      events: outcome.events,
    });
    const events = candidates.flatMap((candidate) => candidate.events);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.connectorEventId).toMatch(/^mcpServer::/);
    }
  });
});
