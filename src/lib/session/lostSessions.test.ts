import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../record-kernel/kernelTypes";
import { lostSessionRecords } from "./lostSessions";

const session = (id: string, extra: Partial<MoriRecord> = {}): MoriRecord =>
  ({ id, schemaId: "agent-session", title: id, status: "active", properties: { agentId: "claude" }, ...extra }) as MoriRecord;

describe("session records whose original is gone", () => {
  const discovered = { ids: new Set(["auto-claude-on-disk"]), agents: new Set(["claude"]) };

  it("lists a record that is neither stored nor on disk", () => {
    const records = [session("auto-claude-gone"), session("auto-claude-on-disk"), session("auto-claude-stored")];
    expect(lostSessionRecords(records, new Set(["auto-claude-stored"]), discovered).map((r) => r.id)).toEqual(["auto-claude-gone"]);
  });

  it("claims nothing before a discovery pass, or for an agent whose listing found nothing", () => {
    expect(lostSessionRecords([session("auto-claude-gone")], new Set(), null)).toEqual([]);
    const codex = session("auto-codex-gone", { properties: { agentId: "codex" } });
    expect(lostSessionRecords([codex], new Set(), discovered)).toEqual([]);
  });

  it("leaves out other records and discarded or archived sessions", () => {
    const note = { ...session("note-1"), schemaId: "note" } as MoriRecord;
    const records = [note, session("auto-claude-x", { status: "discarded" }), session("auto-claude-y", { status: "archived" })];
    expect(lostSessionRecords(records, new Set(), discovered)).toEqual([]);
  });
});
