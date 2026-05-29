import { describe, expect, it } from "vitest";
import {
  containsLikelySecret,
  parseConnectorJsonl,
  redactText,
  validateConnectorEvent,
  validateConnectorEventBatch,
} from "./index";

const VALID_EVENT = {
  id: "evt-1",
  connectorId: "claudeCodeHook",
  kind: "prompt_submitted",
  occurredAt: "2026-05-14T10:00:00Z",
  summary: "Refactor the timeline collision layout.",
  sessionId: "claude-session-abc",
  privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
  provenance: { toolName: "mori-claude-hook.sh", toolVersion: "0.1.0" },
};

describe("validateConnectorEvent", () => {
  it("accepts a well-formed event", () => {
    const result = validateConnectorEvent(VALID_EVENT);
    expect("event" in result).toBe(true);
  });

  it("rejects a non-object input", () => {
    const result = validateConnectorEvent("not an event");
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0].field).toBeNull();
      expect(result.errors[0].message).toMatch(/JSON object/);
    }
  });

  it("requires id, connectorId, kind, occurredAt, summary, privacy, provenance", () => {
    const result = validateConnectorEvent({});
    if (!("errors" in result)) throw new Error("expected errors");
    const fields = new Set(result.errors.map((error) => error.field));
    expect(fields.has("id")).toBe(true);
    expect(fields.has("connectorId")).toBe(true);
    expect(fields.has("kind")).toBe(true);
    expect(fields.has("occurredAt")).toBe(true);
    expect(fields.has("summary")).toBe(true);
    expect(fields.has("privacy")).toBe(true);
    expect(fields.has("provenance")).toBe(true);
  });

  it("accepts unknown kinds (tolerant reader, forward-compatible)", () => {
    // A newer connector may emit a kind this version does not know. We keep it
    // (the normalizer preserves it as a generic event) rather than rejecting.
    const result = validateConnectorEvent({ ...VALID_EVENT, kind: "future_event" });
    if (!("event" in result)) throw new Error("expected the event to be accepted");
    expect(result.event.kind).toBe("future_event");
  });

  it("rejects invalid occurredAt timestamps", () => {
    const result = validateConnectorEvent({ ...VALID_EVENT, occurredAt: "yesterday" });
    if (!("errors" in result)) throw new Error("expected errors");
    expect(result.errors.some((error) => error.field === "occurredAt")).toBe(true);
  });

  it("rejects unknown captureMethod / rawDataPolicy", () => {
    const result = validateConnectorEvent({
      ...VALID_EVENT,
      privacy: { captureMethod: "telepathy", rawDataPolicy: "vibes" },
    });
    if (!("errors" in result)) throw new Error("expected errors");
    const fields = result.errors.map((error) => error.field);
    expect(fields).toContain("privacy.captureMethod");
    expect(fields).toContain("privacy.rawDataPolicy");
  });

  it("enforces tool.name on tool events", () => {
    const result = validateConnectorEvent({
      ...VALID_EVENT,
      kind: "tool_finished",
      tool: {},
    });
    if (!("errors" in result)) throw new Error("expected errors");
    expect(result.errors.some((error) => error.field === "tool.name")).toBe(true);
  });

  it("enforces command on command events", () => {
    const result = validateConnectorEvent({
      ...VALID_EVENT,
      kind: "command_finished",
      command: undefined,
    });
    if (!("errors" in result)) throw new Error("expected errors");
    expect(result.errors.some((error) => error.field === "command")).toBe(true);
  });

  it("accepts file_changed when git.files[] is present even without filePath", () => {
    const result = validateConnectorEvent({
      ...VALID_EVENT,
      kind: "file_changed",
      git: { files: [{ path: "src/foo.ts", changeType: "modified" }] },
    });
    expect("event" in result).toBe(true);
  });

  it("rejects file_changed when neither filePath nor git.files is present", () => {
    const result = validateConnectorEvent({ ...VALID_EVENT, kind: "file_changed" });
    if (!("errors" in result)) throw new Error("expected errors");
    expect(result.errors.some((error) => error.field === "filePath")).toBe(true);
  });
});

describe("parseConnectorJsonl", () => {
  it("parses a JSONL stream and skips blank + comment lines", () => {
    const jsonl = [
      JSON.stringify(VALID_EVENT),
      "",
      "# comment line",
      JSON.stringify({ ...VALID_EVENT, id: "evt-2", summary: "Second event" }),
    ].join("\n");
    const outcome = parseConnectorJsonl(jsonl);
    expect(outcome.events).toHaveLength(2);
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.skippedBlankLines).toBe(2);
  });

  it("reports malformed JSON line by line without throwing", () => {
    const jsonl = [JSON.stringify(VALID_EVENT), "{not json", JSON.stringify({ ...VALID_EVENT, id: "evt-3" })].join("\n");
    const outcome = parseConnectorJsonl(jsonl);
    expect(outcome.events).toHaveLength(2);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0].line).toBe(2);
    expect(outcome.errors[0].field).toBeNull();
    expect(outcome.errors[0].message).toMatch(/Invalid JSON/);
  });

  it("reports validation errors with line numbers", () => {
    // Use a genuinely-invalid line (missing required `summary`); an unknown
    // kind is no longer an error (tolerant reader), so it cannot stand in here.
    const jsonl = [
      JSON.stringify({ ...VALID_EVENT, summary: undefined }),
      JSON.stringify(VALID_EVENT),
    ].join("\n");
    const outcome = parseConnectorJsonl(jsonl);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0].line).toBe(1);
    expect(outcome.errors[0].field).toBe("summary");
  });
});

describe("validateConnectorEventBatch", () => {
  it("validates each event and aggregates errors per index", () => {
    const outcome = validateConnectorEventBatch([VALID_EVENT, { ...VALID_EVENT, id: undefined }]);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.errors[0].index).toBe(1);
    expect(outcome.errors[0].field).toBe("id");
  });
});

describe("redactText", () => {
  it("masks OpenAI-style keys", () => {
    const text = "API key: sk-proj-AbcDefGhi1234567890LMNOP";
    const result = redactText(text);
    expect(result.redacted).toContain("[REDACTED openai key]");
    expect(result.redacted).not.toContain("sk-proj-Abc");
    expect(result.matchedPatterns).toContain("openai-key");
    expect(result.replacementCount).toBeGreaterThan(0);
  });

  it("masks Anthropic keys", () => {
    const text = "sk-ant-api01-thisisafakeanthropickey123";
    const result = redactText(text);
    expect(result.redacted).toContain("[REDACTED anthropic key]");
  });

  it("masks GitHub tokens (ghp_ and github_pat_)", () => {
    const inputs = [
      "ghp_abcdefghijklmnopqrstuv1234567890ABCD",
      "github_pat_11ABCDEFG_aaaabbbbccccdddd",
    ];
    for (const text of inputs) {
      expect(redactText(text).redacted).toContain("[REDACTED github token]");
    }
  });

  it("masks AWS access keys", () => {
    const text = "AKIAIOSFODNN7EXAMPLE was the access key";
    expect(redactText(text).redacted).toContain("[REDACTED aws access key]");
  });

  it("masks Bearer tokens in Authorization header style", () => {
    const text = "Authorization: Bearer abcdef1234567890abcdef";
    expect(redactText(text).redacted).toContain("[REDACTED bearer]");
  });

  it("masks .env-style API_KEY assignments", () => {
    // Either the env-style or the openai-key pattern can fire first; both
    // outcomes redact the value and keep the key prefix intact.
    const text = "OPENAI_API_KEY=sk-1234567890abcdefghij";
    const result = redactText(text);
    expect(result.redacted).toMatch(/OPENAI_API_KEY=\[REDACTED/);
    expect(result.redacted).not.toContain("sk-1234567890abcdefghij");
  });

  it("masks generic SECRET_TOKEN env assignments even without a known prefix", () => {
    const text = "SECRET_TOKEN=abcDEF1234567890zzzz";
    const result = redactText(text);
    expect(result.redacted).toMatch(/SECRET_TOKEN=\[REDACTED\]/);
  });

  it("masks password assignments case-insensitively", () => {
    expect(redactText("password=hunter2supersecret").redacted).toMatch(/password=\[REDACTED\]/);
    expect(redactText("Password: monkey9999banana").redacted).toMatch(/password=\[REDACTED\]/);
  });

  it("leaves benign text alone", () => {
    const result = redactText("Just running pnpm install and tests, nothing secret here.");
    expect(result.redacted).toBe("Just running pnpm install and tests, nothing secret here.");
    expect(result.replacementCount).toBe(0);
  });
});

describe("containsLikelySecret", () => {
  it("detects secrets without redacting", () => {
    expect(containsLikelySecret("OPENAI_API_KEY=sk-abcdefghijklmnop12345")).toBe(true);
  });
  it("returns false for benign text", () => {
    expect(containsLikelySecret("vitest run --watch")).toBe(false);
  });
});
