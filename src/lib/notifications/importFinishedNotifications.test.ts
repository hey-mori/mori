import { describe, expect, it } from "vitest";
import type { StoredSessionImport } from "../storage/storageTypes";
import type { SourceKind } from "../../domain/types";
import { buildImportFinishedNotifications } from "./importFinishedNotifications";

function entry(
  partial: Partial<StoredSessionImport> & {
    id: string;
    savedAt: string;
    kind?: SourceKind;
    title?: string;
    eventCount?: number;
  },
): StoredSessionImport {
  const kind = partial.kind ?? "claudeTranscript";
  return {
    id: partial.id,
    sessionId: "sess-1",
    source: {
      id: `source-${partial.id}`,
      sessionId: "sess-1",
      kind,
      title: partial.title ?? "Claude 대화",
      detail: "",
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "summaryOnly",
      capturedAt: partial.savedAt,
      relatedEventIds: [],
    },
    events: Array.from({ length: partial.eventCount ?? 0 }).map((_, index) => ({
      id: `evt-${partial.id}-${index}`,
      sessionId: "sess-1",
      projectId: "proj-1",
      type: "aiConversation" as const,
      title: `evt ${index}`,
      summary: "",
      start: partial.savedAt,
      end: partial.savedAt,
      sourceRefs: [`source-${partial.id}`],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "verified" as const,
      confidence: 1,
      createdBy: "import" as const,
      userModified: false,
    })),
    savedAt: partial.savedAt,
    adapter: "browser-local-storage",
  };
}

const NOW = new Date("2026-05-24T15:00:00Z").getTime();

describe("buildImportFinishedNotifications", () => {
  it("emits the most recent imports within the window, most recent first", () => {
    const notifications = buildImportFinishedNotifications({
      now: NOW,
      imports: [
        entry({ id: "old", savedAt: "2026-05-20T15:00:00Z" }),
        entry({ id: "fresh-1", savedAt: "2026-05-24T14:00:00Z", eventCount: 3 }),
        entry({ id: "fresh-2", savedAt: "2026-05-24T10:00:00Z" }),
      ],
    });
    expect(notifications.map((n) => n.id)).toEqual([
      "import-finished:fresh-1",
      "import-finished:fresh-2",
    ]);
    expect(notifications[0]!.title).toBe("Claude 대화 3건 가져오기 완료");
  });

  it("caps the visible feed so one big batch doesn't flood the panel", () => {
    const many = Array.from({ length: 6 }).map((_, index) =>
      entry({
        id: `n-${index}`,
        savedAt: new Date(NOW - index * 60_000).toISOString(),
      }),
    );
    const notifications = buildImportFinishedNotifications({
      imports: many,
      now: NOW,
    });
    expect(notifications).toHaveLength(3);
    expect(notifications[0]!.id).toBe("import-finished:n-0");
  });

  it("drops imports outside the recency window", () => {
    const notifications = buildImportFinishedNotifications({
      now: NOW,
      imports: [entry({ id: "ancient", savedAt: "2025-12-01T00:00:00Z" })],
    });
    expect(notifications).toEqual([]);
  });

  it("ignores imports with an invalid savedAt rather than crashing", () => {
    const notifications = buildImportFinishedNotifications({
      now: NOW,
      imports: [entry({ id: "bad", savedAt: "not-a-date" })],
    });
    expect(notifications).toEqual([]);
  });

  it("labels different source kinds in Korean", () => {
    const notifications = buildImportFinishedNotifications({
      now: NOW,
      imports: [
        entry({ id: "git", kind: "gitDiff", savedAt: "2026-05-24T14:30:00Z" }),
        entry({ id: "note", kind: "manualNote", savedAt: "2026-05-24T14:20:00Z" }),
        entry({ id: "url", kind: "browser", savedAt: "2026-05-24T14:10:00Z" }),
      ],
    });
    expect(notifications.map((n) => n.title)).toEqual([
      "Git diff 가져오기 완료",
      "메모 가져오기 완료",
      "URL / 페이지 가져오기 완료",
    ]);
  });
});
