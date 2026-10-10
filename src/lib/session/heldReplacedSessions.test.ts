import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";
import { holdReplacedSessions } from "./heldReplacedSessions";

const meta = (title: string, sourceId?: string): AgentWorkSessionMeta =>
  ({ agentId: "claude", agentName: "Claude", importKind: "claude-code", id: "s1", sessionId: "s1", projectPath: "/p", projectName: "p", filePath: "/x/s1.jsonl", sourceFilePath: "/x/s1.jsonl", startedAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T01:00:00Z", messageCount: 4, title, ...(sourceId ? { sourceId } : {}) }) as AgentWorkSessionMeta;

describe("discovery of a kept session", () => {
  const stored = meta("payments ledger import design", "src-kept");
  const storedMap = new Map([[autoImportedSessionId(stored), stored]]);

  it("keeps its own descriptor when the file at its path is another conversation", () => {
    const [held] = holdReplacedSessions([meta("garden planning for spring", "src-other")], storedMap, () => "src-kept");
    expect(held!.title).toBe("payments ledger import design");
  });

  it("is described from the file while it is the same conversation", () => {
    const [same] = holdReplacedSessions([meta("payments ledger import design, continued", "src-kept")], storedMap, () => "src-kept");
    expect(same!.title).toBe("payments ledger import design, continued");
  });

  it("is described from the file when no copy is kept or the fingerprint is unknown", () => {
    expect(holdReplacedSessions([meta("new", "src-other")], storedMap, () => null)[0]!.title).toBe("new");
    expect(holdReplacedSessions([meta("new")], storedMap, () => "src-kept")[0]!.title).toBe("new");
  });
});
