import { describe, expect, it } from "vitest";
import {
  applyAgentSessionStatusBackfill,
  BackfillReadError,
  planAgentSessionStatusBackfill,
} from "./agentSessionStatusBackfill";
import { KernelRepository } from "./kernelRepository";
import { KernelBrowserStore } from "./kernelStore";
import { applyRecordPatch, createRecord, type CreateRecordInput } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import type { MoriRecord } from "./kernelTypes";

const registry = createSchemaRegistry();
const at = (iso: string) => () => new Date(iso);

function repository() {
  return new KernelRepository({
    runtime: "browser",
    store: new KernelBrowserStore(new MemoryKeyValueStorage()),
  });
}

function sessionInput(id: string, overrides: Partial<CreateRecordInput> = {}): CreateRecordInput {
  return {
    id,
    schemaId: "agent-session",
    title: `세션 ${id}`,
    status: "provisional",
    origin: "automation",
    occurredStart: "2026-08-01T09:00:00.000Z",
    timeBasis: "source-observed",
    properties: { agentId: "claude" },
    now: at("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

async function seed(repo: KernelRepository, input: CreateRecordInput) {
  const { record, revision } = createRecord(input, registry);
  await repo.saveRecord(record, revision);
  return record;
}

async function edit(repo: KernelRepository, record: MoriRecord, actor: "user" | "ai" | "rule") {
  const { record: next, revision } = applyRecordPatch(
    record,
    { title: `${record.title} (수정)` },
    actor,
    registry,
    at("2026-08-02T10:00:00.000Z"),
  );
  await repo.saveRecord(next, revision);
}

async function status(repo: KernelRepository, id: string) {
  return (await repo.getRecord(id)).data?.status;
}

describe("planAgentSessionStatusBackfill (dry run)", () => {
  it("selects only provisional agent sessions that are still entirely automation's", async () => {
    const repo = repository();
    await seed(repo, sessionInput("auto-claude-untouched"));
    const grown = await seed(repo, sessionInput("auto-claude-grown"));
    await edit(repo, grown, "rule");
    const touched = await seed(repo, sessionInput("auto-claude-touched"));
    await edit(repo, touched, "user");
    const interpreted = await seed(repo, sessionInput("auto-claude-ai"));
    await edit(repo, interpreted, "ai");
    await seed(repo, sessionInput("manual-capture", { origin: "user" }));
    await seed(repo, sessionInput("auto-claude-active", { status: "active" }));
    await seed(repo, sessionInput("auto-claude-discarded", { status: "discarded" }));
    await seed(repo, {
      schemaId: "note",
      title: "잠정 메모",
      status: "provisional",
      origin: "automation",
    });

    const plan = await planAgentSessionStatusBackfill(repo);

    expect(plan.scanned).toBe(5);
    expect(plan.eligible.map((entry) => entry.recordId).sort()).toEqual([
      "auto-claude-grown",
      "auto-claude-untouched",
    ]);
    expect(Object.fromEntries(plan.skipped.map((entry) => [entry.recordId, entry.reason]))).toEqual({
      "auto-claude-touched": "user-touched",
      "auto-claude-ai": "not-automation-owned",
      "manual-capture": "not-automation-owned",
    });
  });

  it("writes nothing", async () => {
    const repo = repository();
    await seed(repo, sessionInput("auto-claude-untouched"));
    await planAgentSessionStatusBackfill(repo);
    expect(await status(repo, "auto-claude-untouched")).toBe("provisional");
    expect((await repo.listRevisions("auto-claude-untouched")).data).toHaveLength(1);
  });

  it("refuses to plan over a record list read from the fallback store", async () => {
    const repo = repository();
    const fallback = {
      listRecords: async () => ({ data: [], source: "browser-local-storage" as const, fellBack: true }),
      getRecord: repo.getRecord.bind(repo),
      listRevisions: repo.listRevisions.bind(repo),
      saveRecord: repo.saveRecord.bind(repo),
    };
    await expect(planAgentSessionStatusBackfill(fallback)).rejects.toBeInstanceOf(BackfillReadError);
  });
});

describe("applyAgentSessionStatusBackfill", () => {
  it("promotes each planned record with one rule status-change revision", async () => {
    const repo = repository();
    await seed(repo, sessionInput("auto-claude-untouched"));
    const plan = await planAgentSessionStatusBackfill(repo);

    const result = await applyAgentSessionStatusBackfill(
      repo,
      registry,
      plan,
      at("2026-10-07T12:00:00.000Z"),
    );

    expect(result).toEqual({ promoted: 1, skipped: 0, failed: 0 });
    expect(await status(repo, "auto-claude-untouched")).toBe("active");
    const trail = (await repo.listRevisions("auto-claude-untouched")).data;
    expect(trail.map((revision) => [revision.actor, revision.operation])).toEqual([
      ["rule", "create"],
      ["rule", "status-change"],
    ]);
    expect((trail[1]?.before as MoriRecord).status).toBe("provisional");
  });

  it("is idempotent: a second run promotes nothing and writes nothing", async () => {
    const repo = repository();
    await seed(repo, sessionInput("auto-claude-untouched"));
    const first = await planAgentSessionStatusBackfill(repo);
    await applyAgentSessionStatusBackfill(repo, registry, first);

    const second = await planAgentSessionStatusBackfill(repo);
    const replay = await applyAgentSessionStatusBackfill(repo, registry, first);

    expect(second).toEqual({ scanned: 0, eligible: [], skipped: [] });
    expect(replay).toEqual({ promoted: 0, skipped: 1, failed: 0 });
    expect((await repo.listRevisions("auto-claude-untouched")).data).toHaveLength(2);
  });

  it("re-checks each record, so a user edit between the dry run and the write wins", async () => {
    const repo = repository();
    const record = await seed(repo, sessionInput("auto-claude-untouched"));
    const plan = await planAgentSessionStatusBackfill(repo);
    await edit(repo, record, "user");

    const result = await applyAgentSessionStatusBackfill(repo, registry, plan);

    expect(result).toEqual({ promoted: 0, skipped: 1, failed: 0 });
    expect(await status(repo, "auto-claude-untouched")).toBe("provisional");
  });
});
