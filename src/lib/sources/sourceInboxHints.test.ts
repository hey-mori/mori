import { describe, expect, it } from "vitest";
import {
  buildSourceInboxHint,
  describeSourceInboxFreshness,
  getInboxFamiliesForProvider,
  SOURCE_INBOX_PREVIEW_LIMIT,
} from "./sourceInboxHints";
import type { ConnectorJsonlPreview } from "../connectors";
import type { ConnectorInboxFile, ConnectorInboxListing } from "../desktop";

function file(
  connectorFamily: string,
  displayName: string,
  modifiedAt: string,
): ConnectorInboxFile {
  return {
    path: `/home/me/.mori/connectors/${connectorFamily}/${displayName}`,
    displayName,
    connectorFamily,
    sizeBytes: 1200,
    modifiedAt,
    relativePath: `${connectorFamily}/${displayName}`,
  };
}

function listing(files: ConnectorInboxFile[]): ConnectorInboxListing {
  return {
    rootPath: "/home/me/.mori/connectors",
    rootExists: true,
    files,
  };
}

describe("getInboxFamiliesForProvider", () => {
  it("maps native connector providers to their JSONL inbox families", () => {
    expect(getInboxFamiliesForProvider("claude")).toEqual(["claude-code"]);
    expect(getInboxFamiliesForProvider("codex")).toEqual(["codex-cli"]);
    expect(getInboxFamiliesForProvider("opencode")).toEqual(["opencode-cli"]);
    expect(getInboxFamiliesForProvider("mcp")).toEqual(["mcp"]);
  });

  it("maps local-capture evidence surfaces to the shared local-capture family", () => {
    expect(getInboxFamiliesForProvider("terminal")).toEqual(["local-capture", "terminal"]);
    expect(getInboxFamiliesForProvider("git")).toEqual(["local-capture", "git"]);
    expect(getInboxFamiliesForProvider("note")).toEqual(["local-capture"]);
    expect(getInboxFamiliesForProvider("ide")).toEqual(["local-capture"]);
  });

  it("keeps non-JSONL surfaces out of the inbox hint model", () => {
    expect(getInboxFamiliesForProvider("chatgpt")).toEqual([]);
    expect(getInboxFamiliesForProvider("cursor")).toEqual([]);
    expect(getInboxFamiliesForProvider("url")).toEqual([]);
  });
});

describe("buildSourceInboxHint", () => {
  it("filters and sorts provider-specific files while preserving root metadata", () => {
    const hint = buildSourceInboxHint(
      "codex",
      listing([
        file("claude-code", "claude.jsonl", "2026-05-14T10:00:00Z"),
        file("codex-cli", "old.jsonl", "2026-05-14T09:00:00Z"),
        file("codex-cli", "new.jsonl", "2026-05-14T11:00:00Z"),
      ]),
    );

    expect(hint).not.toBeNull();
    expect(hint!.rootPath).toBe("/home/me/.mori/connectors");
    expect(hint!.rootExists).toBe(true);
    expect(hint!.fileCount).toBe(2);
    expect(hint!.latestFile?.displayName).toBe("new.jsonl");
    expect(hint!.files.map((entry) => entry.displayName)).toEqual(["new.jsonl", "old.jsonl"]);
  });

  it("limits previews to the compact inspector count", () => {
    const files = Array.from({ length: SOURCE_INBOX_PREVIEW_LIMIT + 2 }, (_, index) =>
      file("local-capture", `${index}.jsonl`, `2026-05-14T1${index}:00:00Z`),
    );

    const hint = buildSourceInboxHint("terminal", listing(files));

    expect(hint?.fileCount).toBe(SOURCE_INBOX_PREVIEW_LIMIT + 2);
    expect(hint?.files).toHaveLength(SOURCE_INBOX_PREVIEW_LIMIT);
  });

  it("returns null when a provider has no connector JSONL family", () => {
    expect(buildSourceInboxHint("chatgpt", listing([]))).toBeNull();
  });
});

function preview(overrides: Partial<ConnectorJsonlPreview>): ConnectorJsonlPreview {
  return {
    kind: "valid",
    totalLines: 1,
    skippedBlankLines: 0,
    validEventCount: 1,
    invalidLineCount: 0,
    connectorIds: ["claudeCodeHook"],
    eventKinds: ["prompt_submitted"],
    buckets: [],
    projectPaths: [],
    earliestOccurredAt: "2026-05-14T10:00:00Z",
    latestOccurredAt: "2026-05-14T10:00:00Z",
    redacted: false,
    containsLikelySecret: false,
    errors: [],
    headline: "",
    events: [],
    newEventCount: 1,
    duplicateEventCount: 0,
    newEvents: [],
    duplicateEvents: [],
    duplicateIdentities: [],
    currentSessionDuplicateCount: 0,
    savedSessionDuplicateCount: 0,
    inBatchDuplicateCount: 0,
    identityUnavailableCount: 0,
    savedSessionHistoryAvailable: true,
    matchedSavedSessions: [],
    warnings: [],
    canImport: true,
    ...overrides,
  };
}

describe("describeSourceInboxFreshness", () => {
  it("summarizes all-new files", () => {
    const result = describeSourceInboxFreshness(preview({ newEventCount: 4 }));
    expect(result.status).toBe("new");
    expect(result.tone).toBe("green");
    expect(result.label).toBe("새 이벤트 4");
  });

  it("summarizes partial re-imports with duplicate breakdowns", () => {
    const result = describeSourceInboxFreshness(
      preview({
        newEventCount: 2,
        duplicateEventCount: 3,
        currentSessionDuplicateCount: 1,
        savedSessionDuplicateCount: 2,
        matchedSavedSessions: [{ sessionId: "saved-a", title: "Saved A", events: [] }],
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.tone).toBe("orange");
    expect(result.detail).toContain("현재 세션 1");
    expect(result.detail).toContain("저장 세션 2 (Saved A)");
  });

  it("summarizes duplicate-only files", () => {
    const result = describeSourceInboxFreshness(
      preview({
        newEventCount: 0,
        duplicateEventCount: 3,
        inBatchDuplicateCount: 3,
      }),
    );
    expect(result.status).toBe("duplicate");
    expect(result.label).toBe("이미 가져옴 3");
  });

  it("surfaces unavailable saved-session history", () => {
    const result = describeSourceInboxFreshness(
      preview({ savedSessionHistoryAvailable: false }),
    );
    expect(result.detail).toContain("저장 세션 기록");
  });

  it("summarizes parse failures and empty files", () => {
    expect(
      describeSourceInboxFreshness(
        preview({ kind: "errors-only", invalidLineCount: 2, newEventCount: 0 }),
      ).status,
    ).toBe("invalid");
    expect(describeSourceInboxFreshness(preview({ kind: "empty" })).status).toBe("empty");
  });
});
