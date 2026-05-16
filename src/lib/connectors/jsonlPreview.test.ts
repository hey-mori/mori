import { describe, expect, it } from "vitest";
import {
  buildConnectorJsonlPreview,
  describeConnectorWarningCode,
  type ConnectorPreviewWarningCode,
} from "./jsonlPreview";

const VALID_CLAUDE_EVENT = JSON.stringify({
  id: "claude-001",
  connectorId: "claudeCodeHook",
  kind: "prompt_submitted",
  occurredAt: "2026-05-14T10:01:12Z",
  sessionId: "claude-2026-05-14",
  summary: "Make the Issue Garden responsive at <=1180px",
  privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-claude-hook.sh", toolVersion: "0.1.0" },
});

const VALID_CODEX_EVENT = JSON.stringify({
  id: "codex-001",
  connectorId: "codexCliWrapper",
  kind: "command_finished",
  occurredAt: "2026-05-14T11:07:42Z",
  sessionId: "codex-task-001",
  command: "codex (Upgrade outdated dependencies)",
  summary: "Codex run · exit 0 · 462000ms",
  privacy: { captureMethod: "local_cli_wrapper", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-codex-wrapper.sh", toolVersion: "0.1.0" },
});

const VALID_TERMINAL_EVENT = JSON.stringify({
  id: "term-001",
  connectorId: "terminal",
  kind: "command_finished",
  occurredAt: "2026-05-14T11:10:00Z",
  command: "npm test",
  summary: "npm test · exit 0",
  privacy: { captureMethod: "planned_extension", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-terminal", toolVersion: "0.0.0" },
});

describe("buildConnectorJsonlPreview", () => {
  it("returns empty kind for blank input", () => {
    const preview = buildConnectorJsonlPreview("");
    expect(preview.kind).toBe("empty");
    expect(preview.canImport).toBe(false);
    expect(preview.events).toEqual([]);
  });

  it("returns empty kind for whitespace-only input", () => {
    const preview = buildConnectorJsonlPreview("\n\n   \n");
    expect(preview.kind).toBe("empty");
  });

  it("parses a single valid Claude Code hook event", () => {
    const preview = buildConnectorJsonlPreview(VALID_CLAUDE_EVENT);
    expect(preview.kind).toBe("valid");
    expect(preview.canImport).toBe(true);
    expect(preview.validEventCount).toBe(1);
    expect(preview.invalidLineCount).toBe(0);
    expect(preview.connectorIds).toEqual(["claudeCodeHook"]);
    expect(preview.eventKinds).toEqual(["prompt_submitted"]);
    expect(preview.buckets).toHaveLength(1);
    expect(preview.buckets[0]!.label).toMatch(/Claude Code/);
  });

  it("parses a Codex CLI wrapper event", () => {
    const preview = buildConnectorJsonlPreview(VALID_CODEX_EVENT);
    expect(preview.kind).toBe("valid");
    expect(preview.connectorIds).toEqual(["codexCliWrapper"]);
    expect(preview.buckets[0]!.label).toMatch(/Codex/);
  });

  it("returns mixed kind when valid + invalid lines coexist", () => {
    const input = [VALID_CLAUDE_EVENT, "{ this is broken", VALID_CODEX_EVENT].join("\n");
    const preview = buildConnectorJsonlPreview(input);
    expect(preview.kind).toBe("mixed");
    expect(preview.validEventCount).toBe(2);
    expect(preview.invalidLineCount).toBe(1);
    expect(preview.canImport).toBe(true);
    expect(preview.connectorIds).toEqual(["claudeCodeHook", "codexCliWrapper"]);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(preview.errors[0]!.line).toBeDefined();
  });

  it("returns errors-only when nothing parses", () => {
    const preview = buildConnectorJsonlPreview("{ broken json line }\n{ also broken }");
    expect(preview.kind).toBe("errors-only");
    expect(preview.canImport).toBe(false);
    expect(preview.warnings.some((warning) => warning.code === "all_invalid")).toBe(true);
  });

  it("ignores blank lines and comment lines", () => {
    const input = ["", "# comment", VALID_CLAUDE_EVENT, ""].join("\n");
    const preview = buildConnectorJsonlPreview(input);
    expect(preview.kind).toBe("valid");
    expect(preview.skippedBlankLines).toBeGreaterThan(0);
  });

  it("buckets events by connector + external session id", () => {
    const claudeA = VALID_CLAUDE_EVENT;
    const claudeB = JSON.stringify({
      ...JSON.parse(VALID_CLAUDE_EVENT),
      id: "claude-002",
      occurredAt: "2026-05-14T10:02:00Z",
    });
    const claudeC = JSON.stringify({
      ...JSON.parse(VALID_CLAUDE_EVENT),
      id: "claude-003",
      sessionId: "claude-different-session",
      occurredAt: "2026-05-14T11:00:00Z",
    });
    const preview = buildConnectorJsonlPreview([claudeA, claudeB, claudeC, VALID_CODEX_EVENT].join("\n"));
    expect(preview.buckets).toHaveLength(3);
    const firstBucket = preview.buckets.find((bucket) => bucket.externalSessionId === "claude-2026-05-14");
    expect(firstBucket?.eventCount).toBe(2);
  });

  it("emits a missing_session_id warning when events lack sessionId", () => {
    const unscoped = JSON.stringify({
      ...JSON.parse(VALID_CLAUDE_EVENT),
      sessionId: undefined,
      id: "claude-no-session",
    });
    const preview = buildConnectorJsonlPreview([unscoped, VALID_CODEX_EVENT].join("\n"));
    expect(preview.warnings.some((warning) => warning.code === "missing_session_id")).toBe(true);
  });

  it("emits an unknown_connector_id warning when a connectorId is unrecognised", () => {
    const exotic = JSON.stringify({
      ...JSON.parse(VALID_CLAUDE_EVENT),
      connectorId: "moriExoticConnector",
      id: "exotic-1",
    });
    const preview = buildConnectorJsonlPreview(exotic);
    expect(preview.warnings.some((warning) => warning.code === "unknown_connector_id")).toBe(true);
  });

  it("computes earliest/latest occurredAt across the batch", () => {
    const preview = buildConnectorJsonlPreview(
      [VALID_CLAUDE_EVENT, VALID_CODEX_EVENT, VALID_TERMINAL_EVENT].join("\n"),
    );
    expect(preview.earliestOccurredAt).toBe("2026-05-14T10:01:12.000Z");
    expect(preview.latestOccurredAt).toBe("2026-05-14T11:10:00.000Z");
  });

  it("flags suspected secrets in summary text", () => {
    const withSecret = JSON.stringify({
      ...JSON.parse(VALID_CLAUDE_EVENT),
      summary: "Calling Anthropic with key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      id: "claude-secret",
    });
    const preview = buildConnectorJsonlPreview(withSecret);
    expect(preview.containsLikelySecret).toBe(true);
    expect(preview.warnings.some((warning) => warning.code === "redacted")).toBe(true);
  });

  it("marks canImport false when validEventCount is zero", () => {
    const preview = buildConnectorJsonlPreview("not json");
    expect(preview.canImport).toBe(false);
  });
});

describe("describeConnectorWarningCode", () => {
  const ALL_CODES: ConnectorPreviewWarningCode[] = [
    "redacted",
    "missing_session_id",
    "unknown_connector_id",
    "all_invalid",
    "all_duplicate",
    "partial_duplicate",
    "saved_session_duplicate",
    "saved_session_history_unavailable",
  ];

  it("gives every warning code a non-empty Korean label", () => {
    const hangul = /[가-힣]/;
    for (const code of ALL_CODES) {
      const label = describeConnectorWarningCode(code);
      expect(label.length).toBeGreaterThan(0);
      expect(hangul.test(label)).toBe(true);
      expect(label).not.toBe(code);
    }
  });

  it("maps a few codes to their expected labels", () => {
    expect(describeConnectorWarningCode("redacted")).toBe("민감정보 감지");
    expect(describeConnectorWarningCode("all_duplicate")).toBe("전부 중복");
    expect(describeConnectorWarningCode("unknown_connector_id")).toBe(
      "알 수 없는 커넥터",
    );
  });
});
