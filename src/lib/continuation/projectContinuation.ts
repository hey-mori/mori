/**
 * Project continuation pack · the canonical project-level handoff (#144).
 *
 * Answers "what should the next AI session on this project know": recent
 * sessions, decisions, open tasks, and notes, each citing the record it came
 * from. The project page previews it and copies it; a future local MCP
 * `get_project_context` calls this same function rather than re-deriving it.
 * Session resume stays the single-session handoff, and Reports are unchanged.
 *
 * It is an external output, so inclusion is conservative and every exclusion is
 * counted, never shown:
 *   - a record must be `active`; provisional, candidate, discarded and archived
 *     records stay out;
 *   - an auto-imported session needs an `active` kernel record (a session the
 *     user imported by hand was their own act, so it needs none);
 *   - demo sessions (shown on an empty install) are never included;
 *   - an item whose text trips `containsLikelySecret` is dropped WHOLE, never
 *     masked. That check is a pattern guard: passing it is not proof the text
 *     holds no secret.
 *
 * Raw agent request text is deliberately absent: the default output is
 * structure, titles, and references only (owner decision 4, 2026-10-07).
 *
 * Pure: no React, no storage, no clock of its own.
 */
import { containsLikelySecret } from "../connectors/redaction";
import type { MoriRecord, RecordStatus } from "../record-kernel/kernelTypes";
import { isDemoSessionId } from "../demo/demoSessionFixtures";
import { isAutoImportedSessionId } from "../session/autoImportSessions";
import { AGENT_REGISTRY } from "../trace/sources/ai/agentRegistry";

export const CONTINUATION_WINDOW_DAYS = 30;
export const CONTINUATION_SECTION_CAP = 10;
const DECISION_LINE_MAX = 160;

export type ContinuationSessionInput = {
  id: string;
  title: string;
  /** ISO start of the session; falls back to `savedAt`. */
  startedAt?: string;
  savedAt?: string;
};

export type ContinuationInput = {
  project: { name: string; parentPath: string };
  /** The sessions the project page shows for this project. */
  sessions: readonly ContinuationSessionInput[];
  /** The project's kernel records, any status (exclusions are counted here). */
  records: readonly MoriRecord[];
  /** Kernel records by id, used to read an auto-imported session's status. */
  kernelRecordsById: ReadonlyMap<string, MoriRecord>;
  now: Date;
};

export type ContinuationItem = {
  /** `mori:session/<id>` or `mori:record/<id>`. */
  ref: string;
  title: string;
  /** Day of the item (YYYY-MM-DD) when it has one. */
  day?: string;
  /** Sessions: the agent's name. */
  agent?: string;
  /** Decisions: one line of what was decided. */
  line?: string;
};

export type ContinuationExclusions = {
  /** Provisional, candidate, or (for an auto-imported session) no kernel record. */
  unconfirmed: number;
  /** Discarded or archived. */
  removed: number;
  /** Tripped the secret pattern guard. */
  secretLike: number;
};

export type ProjectContinuationPack = {
  projectPath: string;
  generatedAt: string;
  windowDays: number;
  sessions: ContinuationItem[];
  decisions: ContinuationItem[];
  openTasks: ContinuationItem[];
  notes: ContinuationItem[];
  excluded: ContinuationExclusions;
  /** Eligible items left out only by a section cap. */
  overflow: number;
  markdown: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayOf(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function stamp(iso: string | undefined): number {
  const ms = Date.parse(iso ?? "");
  return Number.isNaN(ms) ? 0 : ms;
}

function recordTime(record: MoriRecord): string {
  return record.occurredStart ?? record.updatedAt ?? record.createdAt;
}

/** One readable line: the first non-empty line, inline markdown markers removed. */
function firstLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? "";
  const plain = line
    .replace(/^#+\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/[*_`~]/g, "")
    .trim();
  return plain.length > DECISION_LINE_MAX ? `${plain.slice(0, DECISION_LINE_MAX - 1)}…` : plain;
}

function agentName(record: MoriRecord | undefined): string | undefined {
  const agentId = record?.properties.agentId;
  if (typeof agentId !== "string") return undefined;
  return AGENT_REGISTRY.find((descriptor) => descriptor.agentId === agentId)?.agentName ?? agentId;
}

type Verdict = "include" | keyof ContinuationExclusions;

function statusVerdict(status: RecordStatus): Verdict {
  if (status === "active") return "include";
  if (status === "discarded" || status === "archived") return "removed";
  return "unconfirmed";
}

export function buildProjectContinuationPack(input: ContinuationInput): ProjectContinuationPack {
  const excluded: ContinuationExclusions = { unconfirmed: 0, removed: 0, secretLike: 0 };
  let overflow = 0;
  const windowStart = input.now.getTime() - CONTINUATION_WINDOW_DAYS * DAY_MS;
  const inWindow = (iso: string | undefined) => stamp(iso) >= windowStart;

  const admit = (verdict: Verdict, texts: string[]): boolean => {
    if (verdict !== "include") {
      excluded[verdict] += 1;
      return false;
    }
    if (texts.some((text) => containsLikelySecret(text))) {
      excluded.secretLike += 1;
      return false;
    }
    return true;
  };
  const capped = <T>(items: T[]): T[] => {
    overflow += Math.max(0, items.length - CONTINUATION_SECTION_CAP);
    return items.slice(0, CONTINUATION_SECTION_CAP);
  };

  // Sessions: the page's list, plus any agent-session record bound to this
  // project that the session list no longer carries. One entry per id.
  const sessionsById = new Map<string, ContinuationSessionInput>();
  for (const session of input.sessions) {
    // The project page fills an empty install with demo sessions. They are not
    // the user's records, so they never enter a handoff, and are not counted.
    if (isDemoSessionId(session.id)) continue;
    sessionsById.set(session.id, session);
  }
  for (const record of input.records) {
    if (record.schemaId !== "agent-session" || sessionsById.has(record.id)) continue;
    sessionsById.set(record.id, { id: record.id, title: record.title, startedAt: record.occurredStart });
  }

  const sessions: Array<ContinuationItem & { at: number }> = [];
  for (const session of sessionsById.values()) {
    const when = session.startedAt || session.savedAt;
    if (!inWindow(when)) continue;
    const kernel = input.kernelRecordsById.get(session.id);
    let verdict: Verdict = "include";
    if (kernel) verdict = statusVerdict(kernel.status);
    else if (isAutoImportedSessionId(session.id)) verdict = "unconfirmed";
    if (!admit(verdict, [session.title])) continue;
    sessions.push({
      ref: `mori:session/${session.id}`,
      title: session.title.trim() || "제목 없음",
      day: dayOf(when),
      agent: agentName(kernel),
      at: stamp(when),
    });
  }

  const byNewest = (a: MoriRecord, b: MoriRecord) => stamp(recordTime(b)) - stamp(recordTime(a));
  const ofSchema = (schemaId: string) =>
    input.records.filter((record) => record.schemaId === schemaId).sort(byNewest);

  const decisions: ContinuationItem[] = [];
  for (const record of ofSchema("decision")) {
    if (!admit(statusVerdict(record.status), [record.title, record.body])) continue;
    const line = firstLine(record.body);
    decisions.push({
      ref: `mori:record/${record.id}`,
      title: record.title.trim(),
      day: dayOf(recordTime(record)),
      ...(line && line !== record.title.trim() ? { line } : {}),
    });
  }

  const openTasks: ContinuationItem[] = [];
  for (const record of ofSchema("task")) {
    if (record.properties.done === true) continue;
    if (!admit(statusVerdict(record.status), [record.title, record.body])) continue;
    const due = typeof record.properties.due === "string" ? record.properties.due : undefined;
    openTasks.push({ ref: `mori:record/${record.id}`, title: record.title.trim(), day: dayOf(due) });
  }

  const notes: ContinuationItem[] = [];
  for (const record of ofSchema("note")) {
    if (!inWindow(record.updatedAt ?? record.createdAt)) continue;
    if (!admit(statusVerdict(record.status), [record.title, record.body])) continue;
    notes.push({
      ref: `mori:record/${record.id}`,
      title: record.title.trim(),
      day: dayOf(record.updatedAt ?? record.createdAt),
    });
  }

  const sections = {
    sessions: capped(sessions.sort((a, b) => b.at - a.at)).map(({ at: _at, ...item }) => item),
    decisions: capped(decisions),
    openTasks: capped(openTasks),
    notes: capped(notes),
  };
  const pack: Omit<ProjectContinuationPack, "markdown"> = {
    projectPath: input.project.parentPath
      ? `${input.project.parentPath}/${input.project.name}`
      : input.project.name,
    generatedAt: input.now.toISOString(),
    windowDays: CONTINUATION_WINDOW_DAYS,
    ...sections,
    excluded,
    overflow,
  };
  return { ...pack, markdown: renderContinuationMarkdown(pack) };
}

function itemLine(item: ContinuationItem, kind: "session" | "decision" | "task" | "note"): string {
  const parts: string[] = [];
  if (item.day) parts.push(kind === "task" ? `기한 ${item.day}` : item.day);
  if (item.agent) parts.push(item.agent);
  parts.push(item.title);
  let line = `- ${parts.join(" · ")}`;
  if (item.line) line += `: ${item.line}`;
  return `${line} (${item.ref})`;
}

export function renderContinuationMarkdown(
  pack: Omit<ProjectContinuationPack, "markdown">,
): string {
  const lines: string[] = [
    `# 프로젝트 이어가기 · ${pack.projectPath}`,
    "",
    `${dayOf(pack.generatedAt)} 기준 · 세션과 노트는 최근 ${pack.windowDays}일 · Mori 로컬 기록에서 생성`,
  ];
  const section = (
    heading: string,
    items: ContinuationItem[],
    kind: "session" | "decision" | "task" | "note",
  ) => {
    if (items.length === 0) return;
    lines.push("", `## ${heading}`, ...items.map((item) => itemLine(item, kind)));
  };
  section("최근 세션", pack.sessions, "session");
  section("결정", pack.decisions, "decision");
  section("열린 할 일", pack.openTasks, "task");
  section("노트", pack.notes, "note");

  const empty =
    pack.sessions.length + pack.decisions.length + pack.openTasks.length + pack.notes.length === 0;
  if (empty) lines.push("", "이 프로젝트에는 아직 이어갈 확정된 기록이 없습니다.");

  const notes: string[] = [];
  if (pack.excluded.unconfirmed > 0) notes.push(`확정되지 않은 항목 ${pack.excluded.unconfirmed}개`);
  if (pack.excluded.removed > 0) notes.push(`버리거나 보관한 항목 ${pack.excluded.removed}개`);
  if (pack.excluded.secretLike > 0) notes.push(`비밀 정보로 보이는 항목 ${pack.excluded.secretLike}개`);
  if (notes.length > 0) lines.push("", `제외됨: ${notes.join(" · ")}`);
  if (pack.overflow > 0) lines.push(`표시 한도를 넘어 생략한 항목 ${pack.overflow}개`);
  return `${lines.join("\n")}\n`;
}
