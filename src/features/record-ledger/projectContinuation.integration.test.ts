/**
 * #145 → #146 contract, end to end through production code: a session that
 * auto-import discovers must reach the project continuation pack, because
 * discovery now creates it `active`; one created `provisional` before that
 * change must not. Nothing here hand-builds an `active` fixture: the records come
 * from `upsertAgentSessionRecords`, the session list from the same draft
 * registration and summary read the store uses, and the project grouping from
 * `buildProjectGroups`, exactly as `ContextView` composes them.
 */
import { describe, expect, it } from "vitest";
import { buildProjectContinuationPack } from "../../lib/continuation/projectContinuation";
import { upsertAgentSessionRecords } from "../../lib/record-kernel/agentSessionRecordAdapter";
import { KernelRepository } from "../../lib/record-kernel/kernelRepository";
import { KernelBrowserStore } from "../../lib/record-kernel/kernelStore";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import {
  agentSessionToStoredDraft,
  autoImportedSessionId,
} from "../../lib/session/autoImportSessions";
import { BrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../../lib/storage/memoryStorage";
import type { AgentWorkSessionMeta } from "../../lib/trace/sources/ai/workSessions";
import { buildProjectGroups } from "./projectGroups";

const NOW = new Date("2026-10-08T12:00:00.000Z");

function meta(id: string, title: string): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id,
    sessionId: id,
    projectPath: "/home/isaac/dev/mori",
    projectName: "mori",
    filePath: `/logs/${id}.jsonl`,
    sourceFilePath: `/logs/${id}.jsonl`,
    startedAt: "2026-10-06T09:00:00.000Z",
    updatedAt: "2026-10-06T10:30:00.000Z",
    messageCount: 12,
    title,
  } as AgentWorkSessionMeta;
}

async function discover(metas: AgentWorkSessionMeta[]) {
  const kernel = new KernelRepository({
    runtime: "browser",
    store: new KernelBrowserStore(new MemoryKeyValueStorage()),
  });
  const drafts = new BrowserDraftRepository(new MemoryKeyValueStorage());
  await kernel.saveContext({ id: "ctx-mori", type: "project", name: "mori", createdAt: NOW.toISOString() });
  // What useAutoImportSessions does per pass: register the draft, then dual-write.
  for (const entry of metas) drafts.putStoredSessionDraft(agentSessionToStoredDraft(entry));
  const result = await upsertAgentSessionRecords(kernel, createSchemaRegistry(), metas);
  return { kernel, drafts, result };
}

async function packFor(kernel: KernelRepository, drafts: BrowserDraftRepository) {
  const [records, contexts, relations] = await Promise.all([
    kernel.listRecords(),
    kernel.listContexts(),
    kernel.listRelations(),
  ]);
  const group = buildProjectGroups(
    drafts.listStoredSessions(),
    contexts.data,
    records.data,
    relations.data,
  ).find((entry) => entry.context?.id === "ctx-mori");
  if (!group) throw new Error("the mori project group did not form");
  return buildProjectContinuationPack({
    project: { name: group.name, parentPath: group.parentPath },
    sessions: group.sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      startedAt: session.startedAt,
      savedAt: session.savedAt,
    })),
    records: group.records,
    kernelRecordsById: new Map(records.data.map((record) => [record.id, record])),
    now: NOW,
  });
}

describe("project continuation · discovered sessions through production code", () => {
  it("hands off a session auto-import discovered, because discovery creates it active", async () => {
    const discovered = meta("conv-auth", "인증 미들웨어 마이그레이션");
    const { kernel, drafts, result } = await discover([discovered]);
    expect(result).toMatchObject({ created: 1, failed: 0 });

    const pack = await packFor(kernel, drafts);

    expect(pack.sessions).toEqual([
      {
        ref: `mori:session/${autoImportedSessionId(discovered)}`,
        title: "인증 미들웨어 마이그레이션",
        day: "2026-10-06",
        agent: "Claude",
      },
    ]);
    expect(pack.excluded).toEqual({ unconfirmed: 0, removed: 0, secretLike: 0 });
  });

  it("keeps out a session whose kernel record is still provisional from before #145", async () => {
    const old = meta("conv-old", "예전에 잠정으로 기록된 세션");
    const { kernel, drafts } = await discover([old]);
    const id = autoImportedSessionId(old);
    const current = (await kernel.getRecord(id)).data;
    if (!current) throw new Error("record missing");
    // The status pre-#145 discovery wrote. Rediscovery never changes it (#139).
    await kernel.saveRecord(
      { ...current, status: "provisional" },
      { id: "rev-legacy", recordId: id, actor: "rule", operation: "create", after: { ...current, status: "provisional" }, createdAt: current.createdAt },
    );
    await upsertAgentSessionRecords(kernel, createSchemaRegistry(), [
      { ...old, messageCount: 30, updatedAt: "2026-10-06T11:00:00.000Z" },
    ]);

    const pack = await packFor(kernel, drafts);

    expect((await kernel.getRecord(id)).data?.status).toBe("provisional");
    expect(pack.sessions).toEqual([]);
    expect(pack.excluded.unconfirmed).toBe(1);
  });
});
