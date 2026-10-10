import { describe, expect, it } from "vitest";
import type { KernelContext, KernelRelation } from "../../lib/record-kernel/kernelTypes";
import { buildAgentSessionRecordInput } from "../../lib/record-kernel/agentSessionRecordAdapter";
import { autoImportedSessionId, agentSessionToStoredDraft } from "../../lib/session/autoImportSessions";
import type { AgentWorkSessionMeta } from "../../lib/trace/sources/ai/workSessions";
import { recordProject } from "../record-ledger/projectScope";
import { sessionCrumbs, sessionProjectIdentity, sessionReturnLink } from "./sessionProjectIdentity";

const at = "2026-10-08T00:00:00Z";
const context = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: at,
  ...extra,
});

const infra = context("ctx-infra", "infra");
// A live project whose name matches the source folder: it must never be the
// answer just because the agent worked in a folder called "dev".
const dev = context("ctx-dev", "dev");
const contexts = [infra, dev];
const session = (contextIds: string[], properties: Record<string, unknown> = {}) => ({
  id: "auto-claude-abc",
  contextIds,
  properties,
});

describe("session project identity", () => {
  it("A1 · a confirmed project is the answer, not the source folder", () => {
    expect(sessionProjectIdentity(session(["ctx-infra"]), contexts)).toEqual({
      kind: "member",
      contextId: "ctx-infra",
      label: "infra",
    });
  });

  it("A2 · an unfiled session gets no project, even when a project shares its folder's name", () => {
    expect(sessionProjectIdentity(session([]), contexts)).toEqual({ kind: "none" });
  });

  it("A3 · a suggestion (which lives only in the project page's projection) is not a membership", () => {
    // The suggestion is never written to the record: nothing here points at a project.
    expect(sessionProjectIdentity(session([], { sourceRepository: "infra" }), contexts)).toEqual({ kind: "none" });
  });

  it("A4 · a rejected project is not shown and not navigated to", () => {
    const rejected = session([], { projectReview: { rejected: ["ctx-infra"] } });
    expect(sessionProjectIdentity(rejected, contexts)).toEqual({ kind: "none" });
  });

  it("A5 · a moved session follows the reviewed change", () => {
    const moved = sessionProjectIdentity(session(["ctx-dev"]), contexts);
    expect(moved).toMatchObject({ kind: "member", contextId: "ctx-dev" });
  });

  it("A6 · same-named projects resolve by id and are told apart by path", () => {
    const work = context("ctx-work", "회사");
    const home = context("ctx-home", "개인");
    const workInfra = context("ctx-work-infra", "infra", { parentId: "ctx-work" });
    const homeInfra = context("ctx-home-infra", "infra", { parentId: "ctx-home" });
    const all = [work, home, workInfra, homeInfra];
    expect(sessionProjectIdentity(session(["ctx-home-infra"]), all)).toEqual({
      kind: "member",
      contextId: "ctx-home-infra",
      label: "개인/infra",
    });
  });

  it("A7 · an archived or missing project is reported, never replaced by a live namesake", () => {
    const archived = context("ctx-old-infra", "infra", { archived: true });
    expect(sessionProjectIdentity(session(["ctx-old-infra"]), [archived, infra])).toEqual({
      kind: "invalid",
      reason: "archived",
    });
    expect(sessionProjectIdentity(session(["ctx-gone"]), contexts)).toEqual({ kind: "invalid", reason: "missing" });
  });

  it("A8 · a routine or topic listed first does not hide the project", () => {
    const routine = context("ctx-routine", "morning", { type: "routine" });
    expect(sessionProjectIdentity(session(["ctx-routine", "ctx-infra"]), [routine, ...contexts])).toMatchObject({
      kind: "member",
      contextId: "ctx-infra",
    });
  });

  it("A9 · membership holds without any observed repository", () => {
    expect(sessionProjectIdentity(session(["ctx-infra"], {}), contexts)).toMatchObject({ kind: "member" });
  });

  it("a belongs-to relation alone is not a reviewed project, even though the 기록 scope counts it", () => {
    // "활동으로 기록" writes this relation from the agent's folder, with no review.
    const relation = {
      id: "rel-1",
      type: "belongs-to",
      fromRecordId: "auto-claude-abc",
      toContextId: "ctx-dev",
      createdAt: at,
    } as KernelRelation;
    expect(recordProject(session([]), contexts, [relation])?.id).toBe("ctx-dev");
    expect(sessionProjectIdentity(session([]), contexts)).toEqual({ kind: "none" });
    expect(sessionCrumbs(sessionProjectIdentity(session([]), contexts), "dev").lead).toEqual({ kind: "source", sourceKey: "dev" });
  });

  it("an unreadable record claims nothing", () => {
    expect(sessionProjectIdentity(null, contexts)).toEqual({ kind: "unknown" });
  });

  it("A10 · the session's id is its kernel record's id, by the adapter's own mapping", () => {
    const meta = {
      agentId: "claude",
      agentName: "Claude Code",
      importKind: "claude-code",
      id: "d1735296-1923-4766-8efa-0d0f9d2411f9",
      sessionId: "d1735296-1923-4766-8efa-0d0f9d2411f9",
      projectPath: "/home/u/dev",
      projectName: "dev",
      filePath: "/x.jsonl",
      sourceFilePath: "/x.jsonl",
      startedAt: at,
      updatedAt: at,
      messageCount: 3,
      title: "Personal systems architecture discovery",
    } as AgentWorkSessionMeta;
    const draft = agentSessionToStoredDraft(meta);
    const record = buildAgentSessionRecordInput(meta, []);
    // Neither the source session uuid nor the title is the lookup key.
    expect(draft.session.id).toBe(autoImportedSessionId(meta));
    expect(record.id).toBe(draft.session.id);
    expect(draft.session.id).not.toBe(meta.sessionId);
  });
});

describe("session breadcrumb", () => {
  it("leads with the reviewed project, routed by context id, and keeps the folder as source", () => {
    const work = context("ctx-work", "회사");
    const home = context("ctx-home", "개인");
    const all = [work, home, context("ctx-a", "infra", { parentId: "ctx-work" }), context("ctx-b", "infra", { parentId: "ctx-home" })];
    const crumbs = sessionCrumbs(sessionProjectIdentity(session(["ctx-b"]), all), "dev");
    expect(crumbs).toEqual({
      lead: { kind: "project", contextId: "ctx-b", label: "개인/infra" },
      trailingSource: "dev",
    });
  });

  it("an unfiled session leads with its folder, as a folder", () => {
    expect(sessionCrumbs(sessionProjectIdentity(session([]), contexts), "dev")).toEqual({
      lead: { kind: "source", sourceKey: "dev" },
      trailingSource: null,
    });
  });

  it("a project needing review has no route and keeps the folder as source", () => {
    expect(sessionCrumbs({ kind: "invalid", reason: "archived" }, "dev")).toEqual({
      lead: { kind: "review-needed", reason: "archived" },
      trailingSource: "dev",
    });
  });

  it("an unreadable record falls back to the folder, never to a guessed project", () => {
    expect(sessionCrumbs({ kind: "unknown" }, "infra")).toEqual({
      lead: { kind: "source", sourceKey: "infra" },
      trailingSource: null,
    });
    expect(sessionCrumbs({ kind: "unknown" }, null)).toEqual({ lead: null, trailingSource: null });
  });
});

describe("the way back to the project page a session was opened from", () => {
  const from = { to: "project" as const, sessionId: "s1", contextId: "ctx-infra", label: "infra", viaSearch: false };
  const member = { kind: "project" as const, contextId: "ctx-infra", label: "infra" };
  const folder = { kind: "source" as const, sourceKey: "/home/u/dev" };
  it("shows for a session the breadcrumb does not lead back from", () => {
    expect(sessionReturnLink(from, "s1", folder)).toBe(from);
    expect(sessionReturnLink(from, "s1", null)).toBe(from);
    expect(sessionReturnLink(from, "s1", { ...member, contextId: "ctx-other" })).toBe(from);
  });
  it("is left out when the breadcrumb already leads to that project, unless it came from a search", () => {
    expect(sessionReturnLink(from, "s1", member)).toBeNull();
    expect(sessionReturnLink({ ...from, viaSearch: true }, "s1", member)).toEqual({ ...from, viaSearch: true });
  });
  it("belongs to the session it was set for only", () => {
    expect(sessionReturnLink(from, "s2", folder)).toBeNull();
    expect(sessionReturnLink(null, "s1", folder)).toBeNull();
  });
  it("leads back to a calendar day whatever the breadcrumb says", () => {
    const day = { to: "calendar" as const, sessionId: "s1", date: "2026-10-10", label: "캘린더 10월 10일" };
    expect(sessionReturnLink(day, "s1", member)).toBe(day);
    expect(sessionReturnLink(day, "s1", null)).toBe(day);
    expect(sessionReturnLink(day, "s2", member)).toBeNull();
  });
});
