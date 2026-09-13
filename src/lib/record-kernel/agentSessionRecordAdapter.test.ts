import { describe, expect, it } from "vitest";
import {
  buildAgentSessionRecordInput,
  upsertAgentSessionRecords,
} from "./agentSessionRecordAdapter";
import { autoImportedSessionId } from "../session/autoImportSessions";
import { createRecord } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import type { KernelContext, MoriRecord, KernelRevision } from "./kernelTypes";
import type { KernelResult } from "./kernelRepository";

function meta(partial: Partial<AgentWorkSessionMeta> = {}): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id: "conv-123",
    sessionId: "conv-123",
    projectPath: "/Users/x/dev/mori",
    projectName: "mori",
    filePath: "/logs/conv-123.jsonl",
    sourceFilePath: "/logs/conv-123.jsonl",
    startedAt: "2026-07-16T09:00:00.000Z",
    updatedAt: "2026-07-16T10:30:00.000Z",
    messageCount: 12,
    title: "Auth 미들웨어 마이그레이션",
    ...partial,
  } as AgentWorkSessionMeta;
}

function ctx(id: string, name: string): KernelContext {
  return { id, type: "project", name, createdAt: "2026-07-01T00:00:00.000Z" };
}

describe("buildAgentSessionRecordInput", () => {
  it("mirrors a session as a thin, provisional agent-session record keyed by its stable id", () => {
    const input = buildAgentSessionRecordInput(meta(), []);
    expect(input.id).toBe(autoImportedSessionId(meta()));
    expect(input.schemaId).toBe("agent-session");
    expect(input.status).toBe("provisional");
    expect(input.origin).toBe("automation");
    expect(input.title).toBe("Auth 미들웨어 마이그레이션");
    expect(input.timeBasis).toBe("source-observed");
    expect(input.occurredStart).toBe("2026-07-16T09:00:00.000Z");
    expect(input.occurredEnd).toBe("2026-07-16T10:30:00.000Z");
    expect(input.properties).toEqual({ agentId: "claude", stepCount: 12 });
    expect(input.body).toContain("메시지 12개");
  });

  it("binds only to an existing context matched by project name, never invents one", () => {
    const bound = buildAgentSessionRecordInput(meta(), [ctx("ctx-mori", "mori")]);
    expect(bound.contextIds).toEqual(["ctx-mori"]);
    const unmatched = buildAgentSessionRecordInput(meta({ projectName: "other" }), [
      ctx("ctx-mori", "mori"),
    ]);
    expect(unmatched.contextIds).toEqual([]);
  });

  it("keeps the activity time unknown (never fabricated) when the session has no start", () => {
    const input = buildAgentSessionRecordInput(meta({ startedAt: "", updatedAt: "" }), []);
    expect(input.timeBasis).toBe("unknown");
    expect(input.occurredStart).toBeUndefined();
    expect(input.occurredEnd).toBeUndefined();
  });

  it("produces a record the factory accepts (schema + time invariants hold)", () => {
    const registry = createSchemaRegistry();
    const built = buildAgentSessionRecordInput(meta(), []);
    // createRecord throws on any invariant violation; a clean create is the assertion.
    expect(() => createRecord(built, registry)).not.toThrow();
  });
});

describe("upsertAgentSessionRecords", () => {
  function fakeRepo() {
    const saved: MoriRecord[] = [];
    const contexts: KernelContext[] = [ctx("ctx-mori", "mori")];
    return {
      saved,
      listContexts: async (): Promise<KernelResult<KernelContext[]>> => ({
        data: contexts,
        source: "browser-local-storage",
        fellBack: false,
      }),
      saveRecord: async (record: MoriRecord, _revision: KernelRevision): Promise<KernelResult<MoriRecord>> => {
        saved.push(record);
        return { data: record, source: "browser-local-storage", fellBack: false };
      },
    };
  }

  it("writes one provisional record per session, bound to a matching context", async () => {
    const repo = fakeRepo();
    const registry = createSchemaRegistry();
    const result = await upsertAgentSessionRecords(repo, registry, [
      meta(),
      meta({ id: "conv-456", title: "리포트 정리", projectName: "other" }),
    ]);
    expect(result).toEqual({ written: 2, failed: 0 });
    expect(repo.saved.map((r) => r.status)).toEqual(["provisional", "provisional"]);
    expect(repo.saved[0]?.contextIds).toEqual(["ctx-mori"]);
    expect(repo.saved[1]?.contextIds).toEqual([]);
  });

  it("counts a per-record failure without aborting the batch", async () => {
    const repo = fakeRepo();
    let calls = 0;
    const flaky = {
      ...repo,
      saveRecord: async (record: MoriRecord): Promise<KernelResult<MoriRecord>> => {
        calls += 1;
        if (calls === 1) throw new Error("write failed");
        repo.saved.push(record);
        return { data: record, source: "browser-local-storage", fellBack: false };
      },
    };
    const result = await upsertAgentSessionRecords(flaky, createSchemaRegistry(), [
      meta(),
      meta({ id: "conv-456" }),
    ]);
    expect(result).toEqual({ written: 1, failed: 1 });
  });

  it("no-ops on an empty batch", async () => {
    const repo = fakeRepo();
    expect(await upsertAgentSessionRecords(repo, createSchemaRegistry(), [])).toEqual({
      written: 0,
      failed: 0,
    });
    expect(repo.saved).toHaveLength(0);
  });
});
