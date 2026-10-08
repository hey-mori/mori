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
 * Session outcome evidence (v1) adds, per session, the PRs its source links
 * to, with how much of the source was read. They are labelled as
 * observations: a linked PR is not claimed as authored or merged, and partial
 * coverage is stated, never implied complete. Observed branch names stay on
 * the record but are not handed off: a branch seen in a shared working tree
 * can be another session's, and in a fair test agents read them as the
 * session's own work. A session
 * that is not a person's conversation (only slash commands, a scripted run, or
 * nothing at all) is left out and counted by reason. Physical transcript
 * segments the source links with `continued-in` are shown as one session.
 *
 * Pure: no React, no storage, no clock of its own.
 */
import { containsLikelySecret } from "../connectors/redaction";
import type { MoriRecord, RecordStatus } from "../record-kernel/kernelTypes";
import { isDemoSessionId } from "../demo/demoSessionFixtures";
import { isAutoImportedSessionId } from "../session/autoImportSessions";
import { readSessionEvidence, type RecordedSessionEvidence } from "../record-kernel/agentSessionEvidence";
import { AGENT_REGISTRY } from "../trace/sources/ai/agentRegistry";

export const CONTINUATION_WINDOW_DAYS = 30;
export const CONTINUATION_SECTION_CAP = 10;
/** Per session and repository, how many PRs are listed before "외 N개". A
 *  per-repository cap keeps each repository's most recent work visible in a
 *  session that spans several. */
export const EVIDENCE_PR_CAP = 10;
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
  /** Sources for this project a complete read proved empty, which were never
   *  registered. Counted so the pack does not imply they do not exist. */
  emptySources?: number;
  now: Date;
};

/** The structural Git observations shown for one session. */
export type ContinuationEvidence = {
  /** Linked in the session's source, most recent first; not proof of
   *  authorship or merge. */
  prs: Array<{ repository: string; number: number }>;
  coverage: "complete" | "partial";
  /** Transcript segments joined by the source's `continued-in` link. */
  segments: number;
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
  /** Sessions: the last day observed, when it differs from `day`. */
  lastDay?: string;
  /** Sessions: Git observations, when the session's source reported them. */
  evidence?: ContinuationEvidence;
};

/** Sessions left out because they are not a person's conversation. */
export type ContinuationNonConversation = {
  /** Only slash commands such as `/model` or `/login`. */
  commandOnly: number;
  /** A scripted run (`claude -p`, `codex exec`). */
  automation: number;
  /** No user or assistant record at all, registered or not. */
  empty: number;
};

/** How much the session section can be trusted to be complete. */
export type ContinuationCoverage = {
  /** Sessions whose Git evidence covers the whole source. */
  evidenceComplete: number;
  /** Sessions whose source was only partly read: their lists may be short. */
  evidencePartial: number;
  /** Sessions with no Git evidence recorded (an agent that does not report it,
   *  or a record written before evidence existed). Not "no PRs". */
  evidenceMissing: number;
  /** Included sessions with no reviewed project link: joined by folder only. */
  unlinked: number;
  /** Segments folded into another session by `continued-in`. */
  joinedSegments: number;
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
  nonConversation: ContinuationNonConversation;
  coverage: ContinuationCoverage;
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

  const nonConversation: ContinuationNonConversation = {
    commandOnly: 0,
    automation: 0,
    empty: input.emptySources ?? 0,
  };
  type Candidate = {
    session: ContinuationSessionInput;
    kernel: MoriRecord | undefined;
    evidence: RecordedSessionEvidence | undefined;
    when: string | undefined;
    end: string | undefined;
  };
  const candidates: Candidate[] = [];
  for (const session of sessionsById.values()) {
    const when = session.startedAt || session.savedAt;
    if (!inWindow(when)) continue;
    const kernel = input.kernelRecordsById.get(session.id);
    let verdict: Verdict = "include";
    if (kernel) verdict = statusVerdict(kernel.status);
    else if (isAutoImportedSessionId(session.id)) verdict = "unconfirmed";
    if (verdict === "include" && kernel) {
      // Not a person's conversation: real activity, but not a handoff.
      const activity = kernel.properties.activityClass;
      if (kernel.properties.interaction === "automation") {
        nonConversation.automation += 1;
        continue;
      }
      if (activity === "command-only") {
        nonConversation.commandOnly += 1;
        continue;
      }
      if (activity === "empty") {
        nonConversation.empty += 1;
        continue;
      }
    }
    if (!admit(verdict, [session.title])) continue;
    candidates.push({
      session,
      kernel,
      evidence: readSessionEvidence(kernel?.properties.sessionEvidence),
      when,
      end: kernel?.occurredEnd,
    });
  }

  // Fold segments the source links with `continued-in` into the segment they
  // continue in, following the chain to its last segment. Only an explicit
  // link joins segments; similar titles or times never do.
  const bySegment = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (candidate.evidence?.segment) bySegment.set(candidate.evidence.segment, candidate);
  }
  const chainEnd = (candidate: Candidate): Candidate => {
    let current = candidate;
    const visited = new Set<Candidate>([current]);
    for (;;) {
      const next = current.evidence?.continuesIn ? bySegment.get(current.evidence.continuesIn) : undefined;
      if (!next || visited.has(next)) return current;
      visited.add(next);
      current = next;
    }
  };
  const groups = new Map<Candidate, Candidate[]>();
  for (const candidate of candidates) {
    const end = chainEnd(candidate);
    groups.set(end, [...(groups.get(end) ?? []), candidate]);
  }

  const coverage: ContinuationCoverage = {
    evidenceComplete: 0,
    evidencePartial: 0,
    evidenceMissing: 0,
    unlinked: 0,
    joinedSegments: 0,
  };
  const sessions: Array<ContinuationItem & { at: number }> = [];
  for (const [last, members] of groups) {
    coverage.joinedSegments += members.length - 1;
    const ordered = [...members].sort((a, b) => stamp(a.when) - stamp(b.when));
    const first = ordered[0];
    const evidences = ordered.flatMap((member) => (member.evidence ? [member.evidence] : []));
    const evidence = mergeEvidence(evidences, ordered.length);
    if (!evidence) coverage.evidenceMissing += 1;
    else if (evidence.coverage === "complete") coverage.evidenceComplete += 1;
    else coverage.evidencePartial += 1;
    if (!ordered.some((member) => (member.kernel?.contextIds ?? []).length > 0)) coverage.unlinked += 1;
    const lastSeen = ordered.map((member) => member.end ?? member.when).sort((a, b) => stamp(a) - stamp(b)).at(-1);
    const day = dayOf(first.when);
    const lastDay = dayOf(lastSeen);
    sessions.push({
      ref: `mori:session/${last.session.id}`,
      title: last.session.title.trim() || first.session.title.trim() || "제목 없음",
      day,
      ...(lastDay && lastDay !== day ? { lastDay } : {}),
      agent: agentName(last.kernel),
      ...(evidence ? { evidence } : {}),
      at: stamp(first.when),
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
    nonConversation,
    coverage,
    overflow,
  };
  return { ...pack, markdown: renderContinuationMarkdown(pack) };
}

/** One session's evidence across its segments, most recent observation first:
 *  a handoff needs where the work ended, so a capped list keeps the newest.
 *  Coverage is complete only when every segment reported evidence and every
 *  one was read to the end. */
function mergeEvidence(
  evidences: RecordedSessionEvidence[],
  segments: number,
): ContinuationEvidence | undefined {
  if (evidences.length === 0) return undefined;
  const prs: ContinuationEvidence["prs"] = [];
  const seenPrs = new Set<string>();
  // Segments arrive oldest first; walk them newest first, each newest first.
  for (const evidence of [...evidences].reverse()) {
    for (const pr of [...evidence.prs].sort((a, b) => b.line - a.line)) {
      const key = `${pr.repository.toLowerCase()}#${pr.number}`;
      if (seenPrs.has(key)) continue;
      seenPrs.add(key);
      prs.push({ repository: pr.repository, number: pr.number });
    }
  }
  const complete =
    evidences.length === segments && evidences.every((evidence) => evidence.coverage === "complete");
  return { prs, coverage: complete ? "complete" : "partial", segments };
}

/** `acme/home #3 · acme/app #9 #7 외 4개`: repositories by most recent link,
 *  each capped to its newest PRs. */
function prLine(prs: ContinuationEvidence["prs"]): string {
  const byRepo = new Map<string, number[]>();
  for (const pr of prs) byRepo.set(pr.repository, [...(byRepo.get(pr.repository) ?? []), pr.number]);
  return [...byRepo]
    .map(([repo, numbers]) => {
      const shown = numbers.slice(0, EVIDENCE_PR_CAP).map((n) => `#${n}`).join(" ");
      const rest = numbers.length - EVIDENCE_PR_CAP;
      return `${repo} ${shown}${rest > 0 ? ` 외 ${rest}개` : ""}`;
    })
    .join(" · ");
}

function evidenceLines(evidence: ContinuationEvidence): string[] {
  const scope = evidence.coverage === "complete" ? "기록 전체 확인" : "기록 일부만 확인 · 목록이 전부가 아닐 수 있음";
  const segments = evidence.segments > 1 ? ` · 이어진 구간 ${evidence.segments}개` : "";
  if (evidence.prs.length === 0) {
    const found = evidence.coverage === "complete" ? "기록에 연결된 PR 없음" : "아직 찾지 못함";
    return [`  - 연결된 PR: ${found} (${scope}${segments})`];
  }
  return [`  - 기록에 연결된 PR: ${prLine(evidence.prs)}`, `  - 근거 범위: ${scope}${segments}`];
}

function itemLine(item: ContinuationItem, kind: "session" | "decision" | "task" | "note"): string {
  const parts: string[] = [];
  if (item.day) {
    const range = item.lastDay ? `${item.day}~${item.lastDay}` : item.day;
    parts.push(kind === "task" ? `기한 ${item.day}` : range);
  }
  if (item.agent) parts.push(item.agent);
  parts.push(item.title);
  let line = `- ${parts.join(" · ")}`;
  if (item.line) line += `: ${item.line}`;
  line += ` (${item.ref})`;
  return item.evidence ? [line, ...evidenceLines(item.evidence)].join("\n") : line;
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

  const other = pack.nonConversation;
  const consideredSessions = pack.sessions.length + other.commandOnly + other.automation + other.empty;
  if (consideredSessions > 0) {
    lines.push("", "## 근거 범위");
    const c = pack.coverage;
    if (pack.sessions.length > 0) {
      const parts: string[] = [];
      if (c.evidenceComplete > 0) parts.push(`PR 근거 전체 확인 ${c.evidenceComplete}개`);
      if (c.evidencePartial > 0) parts.push(`일부만 확인 ${c.evidencePartial}개`);
      if (c.evidenceMissing > 0) parts.push(`PR 근거 미기록 ${c.evidenceMissing}개`);
      lines.push(`- 세션 ${pack.sessions.length}개: ${parts.join(" · ")}`);
      if (c.evidenceComplete + c.evidencePartial > 0) lines.push(
        "- PR은 세션 기록 속 링크입니다. 이 세션이 만들었는지, 병합됐는지는 확인하지 않았습니다. 목록에 없는 PR이 이 세션과 무관하다는 뜻도 아닙니다.",
      );
    }
    const skipped: string[] = [];
    if (other.commandOnly > 0) skipped.push(`명령만 실행 ${other.commandOnly}개`);
    if (other.automation > 0) skipped.push(`자동 실행 ${other.automation}개`);
    if (other.empty > 0) skipped.push(`내용 없음 ${other.empty}개`);
    if (skipped.length > 0) lines.push(`- 대화가 아니어서 뺀 세션: ${skipped.join(" · ")}`);
    if (c.joinedSegments > 0) lines.push(`- 이어진 기록 구간을 한 세션으로 합침: ${c.joinedSegments}개`);
    if (c.unlinked > 0) lines.push(`- 검토된 프로젝트 연결 없이 폴더 경로로만 묶인 세션: ${c.unlinked}개`);
    if (pack.decisions.length === 0 && pack.openTasks.length === 0) {
      lines.push("- 결정·할 일: Mori에 기록된 항목이 없습니다. 없다는 뜻이 아니라 확인할 기록이 없다는 뜻입니다.");
    }
  }
  return `${lines.join("\n")}\n`;
}
