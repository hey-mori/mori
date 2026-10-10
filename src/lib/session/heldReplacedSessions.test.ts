import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";
import { fingerprintChanged, holdReplacedSessions, movedSessions } from "./heldReplacedSessions";

const meta = (title: string, sourceId?: string, extra: Partial<AgentWorkSessionMeta> = {}): AgentWorkSessionMeta =>
  ({ agentId: "claude", agentName: "Claude", importKind: "claude-code", id: "s1", sessionId: "s1", projectPath: "/p", projectName: "p", filePath: "/x/s1.jsonl", sourceFilePath: "/x/s1.jsonl", startedAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T01:00:00Z", messageCount: 4, title, fileBytes: 900, ...(sourceId ? { sourceId } : {}), ...extra }) as AgentWorkSessionMeta;
const ID = autoImportedSessionId(meta("x"));
const keptCopy = { sourceId: "src-kept", bytes: 900 };
const storedAs = (m: AgentWorkSessionMeta) => new Map([[ID, m]]);

describe("discovery of a kept session", () => {
  const own = meta("payments ledger import design", "src-kept");

  it("keeps its own descriptor when the file at its path is another conversation", () => {
    const out = holdReplacedSessions([meta("garden planning for spring", "src-other")], storedAs(own), () => keptCopy);
    expect(out.map((m) => m.title)).toEqual(["payments ledger import design"]);
  });

  it("takes where the file lives now from the listing, so a restored home can still be read", () => {
    const restored = meta("payments ledger import design", "src-kept", { filePath: "/old-home/x/s1.jsonl", sourceFilePath: "/old-home/x/s1.jsonl" });
    const out = holdReplacedSessions([meta("garden planning for spring", "src-other", { filePath: "/new-home/x/s1.jsonl", sourceFilePath: "/new-home/x/s1.jsonl" })], storedAs(restored), () => keptCopy);
    expect(out[0]).toMatchObject({ title: "payments ledger import design", filePath: "/new-home/x/s1.jsonl", sourceFilePath: "/new-home/x/s1.jsonl" });
  });

  it("keeps its own descriptor when the file was cut short below the copy", () => {
    const out = holdReplacedSessions([meta("payments ledger import design", "src-kept", { fileBytes: 100, messageCount: 1 })], storedAs(own), () => keptCopy);
    expect(out[0]!.messageCount).toBe(4);
  });

  it("is described from the file while it is the same conversation and has grown", () => {
    const out = holdReplacedSessions([meta("payments ledger import design, continued", "src-kept", { fileBytes: 2000 })], storedAs(own), () => keptCopy);
    expect(out[0]!.title).toBe("payments ledger import design, continued");
  });

  it("is described from the file when no copy is kept or the fingerprint is unknown", () => {
    expect(holdReplacedSessions([meta("new", "src-other")], storedAs(own), () => null)[0]!.title).toBe("new");
    expect(holdReplacedSessions([meta("new")], storedAs(own), () => keptCopy)[0]!.title).toBe("new");
  });

  it("writes nothing under the session when no stored descriptor describes the kept conversation", () => {
    const other = meta("garden planning for spring", "src-other");
    expect(holdReplacedSessions([other], new Map(), () => keptCopy)).toEqual([]);
    // A descriptor already rewritten from the other file is not frozen either.
    expect(holdReplacedSessions([other], storedAs(meta("garden planning for spring", "src-other")), () => keptCopy)).toEqual([]);
  });

  it("keeps a descriptor stored before fingerprints were recorded", () => {
    const out = holdReplacedSessions([meta("garden planning for spring", "src-other")], storedAs(meta("payments ledger import design")), () => keptCopy);
    expect(out[0]!.title).toBe("payments ledger import design");
  });

  it("leaves other sessions alone", () => {
    const otherSession = meta("unrelated", "src-u", { id: "s2", sessionId: "s2" });
    const out = holdReplacedSessions([otherSession], storedAs(own), (id) => (id === ID ? keptCopy : null));
    expect(out).toEqual([otherSession]);
  });
});

describe("a changed fingerprint", () => {
  it("is seen only against a recorded one", () => {
    expect(fingerprintChanged([meta("t", "src-other")], storedAs(meta("t", "src-kept")))).toBe(true);
    expect(fingerprintChanged([meta("t", "src-kept")], storedAs(meta("t", "src-kept")))).toBe(false);
    expect(fingerprintChanged([meta("t", "src-other")], storedAs(meta("t")))).toBe(false);
  });
});

describe("a session whose file moved", () => {
  it("follows its file and keeps what describes it", () => {
    const was = meta("payments ledger import design", "src-kept", { filePath: "/old-home/x/s1.jsonl", sourceFilePath: "/old-home/x/s1.jsonl" });
    const now = meta("payments ledger import design", "src-kept", { filePath: "/new-home/x/s1.jsonl", sourceFilePath: "/new-home/x/s1.jsonl", messageCount: 9 });
    const [moved] = movedSessions([now], storedAs(was));
    expect(moved).toMatchObject({ filePath: "/new-home/x/s1.jsonl", sourceFilePath: "/new-home/x/s1.jsonl", messageCount: 4 });
  });

  it("is nothing when the file is where it was or nothing is stored", () => {
    const here = meta("t", "src-kept");
    expect(movedSessions([here], storedAs(here))).toEqual([]);
    expect(movedSessions([here], new Map())).toEqual([]);
  });
});
