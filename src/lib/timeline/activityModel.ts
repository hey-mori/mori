import type { SourceRef, TimelineEvent, TrustLevel } from "../../domain/types";
import type { TimelineDensity } from "./collisionLayout";

export type TimelineSourceFamily =
  | "ai"
  | "code"
  | "terminal"
  | "git"
  | "design"
  | "tracker"
  | "docs"
  | "communication"
  | "research"
  | "build"
  | "deploy"
  | "automation"
  | "manual"
  | "unknown";

export type ActivityKind =
  | "conversation"
  | "explore"
  | "command"
  | "fileChange"
  | "commit"
  | "diff"
  | "designChange"
  | "issueUpdate"
  | "decision"
  | "reviewItem"
  | "note"
  | "urlReference"
  | "buildRun"
  | "testRun"
  | "deploy"
  | "report"
  | "handoff"
  | "memory"
  | "sourceImport"
  | "automationRun"
  | "artifact"
  | "unknown";

export type ActivityLaneId =
  | "conversation"
  | "explore"
  | "command"
  | "files"
  | "git"
  | "design"
  | "tracker"
  | "docs"
  | "research"
  | "build"
  | "deploy"
  | "automation"
  | "review"
  | "handoff"
  | "memory"
  | "notes"
  | "unknown";

export type ActivityTone = "purple" | "green" | "red" | "blue" | "cyan" | "orange" | "gray";

export type ActivityVisuals = {
  label: string;
  shortLabel: string;
  tone: ActivityTone;
  description: string;
};

export type EventImportance = "high" | "medium" | "low";

export type TimelineEvidenceChip = {
  id: string;
  sourceId: string | null;
  sourceFamily: TimelineSourceFamily;
  label: string;
  shortLabel: string;
  trustLevel: TrustLevel | null;
  retention: SourceRef["rawRetention"] | null;
  linked: boolean;
};

export type EventActivityDescriptor = {
  sourceFamily: TimelineSourceFamily;
  sourceFamilies: TimelineSourceFamily[];
  activityKind: ActivityKind;
  lane: ActivityLaneId;
  activityVisuals: ActivityVisuals;
  laneVisuals: ActivityVisuals;
  sourceVisuals: ActivityVisuals;
  importance: EventImportance;
  evidenceChips: TimelineEvidenceChip[];
  metadataLine: string;
  densitySummary: string | null;
};

export const timelineActivityLaneOrder: ActivityLaneId[] = [
  "conversation",
  "explore",
  "command",
  "files",
  "git",
  "design",
  "tracker",
  "docs",
  "research",
  "build",
  "deploy",
  "automation",
  "review",
  "handoff",
  "memory",
  "notes",
  "unknown",
];

/**
 * The Timeline's category set — RAW agent activity only: what Claude / Codex
 * actually did. These are the kinds the swimlane lanes and the category filter
 * draw from. The analysis / curation lanes (tracker=이슈, review=검토,
 * handoff=이어가기, notes=노트, memory=메모리) are deliberately NOT here: those
 * are a derived layer the user does not hand-curate, and they live in the AI 흐름
 * view instead — but their lane definitions stay in `LANE_VISUALS` so the
 * direction is retained, not deleted. Situational raw activity (git / deploy /
 * automation / design / docs) earns a lane only when it has events; see
 * `resolveTimelineLaneOrder`.
 */
export const CANONICAL_TIMELINE_LANES: ActivityLaneId[] = [
  "conversation",
  "explore",
  "command",
  "files",
  "research",
  "build",
];

/**
 * The lane order to render in the swimlane: every canonical (raw-activity) lane,
 * ALWAYS — so the timeline has the same stable shape in every session, not lanes
 * that appear and vanish session to session — followed by any non-canonical lane
 * that actually carries an event. The canonical set is raw activity only, so for
 * a normal agent session the timeline is exactly those lanes, every time.
 */
export function resolveTimelineLaneOrder(
  events: readonly TimelineEvent[],
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>,
): ActivityLaneId[] {
  const sourceIndex = sources
    ? Array.isArray(sources)
      ? buildSourceIndex(sources)
      : (sources as ReadonlyMap<string, SourceRef>)
    : new Map<string, SourceRef>();
  const populated = new Set<ActivityLaneId>();
  for (const event of events) {
    populated.add(getTimelineLaneForEvent({ event, sources: sourceIndex }));
  }
  const extras = timelineActivityLaneOrder.filter(
    (lane) => !CANONICAL_TIMELINE_LANES.includes(lane) && populated.has(lane),
  );
  return [...CANONICAL_TIMELINE_LANES, ...extras];
}

// Korean-first labels. Mori is a Korean-first product; these visuals feed the
// timeline lane headers, conversation-flow group headers, inspector badges,
// card labels, the minimap, and aria-labels, so they must read as the rest of
// the app does. `shortLabel` keeps widely-recognised tokens (AI / Git / URL /
// Diff) as-is rather than forcing an awkward translation.
const SOURCE_FAMILY_VISUALS: Record<TimelineSourceFamily, ActivityVisuals> = {
  ai: { label: "AI 소스", shortLabel: "AI", tone: "purple", description: "AI 대화 또는 에이전트 출력" },
  code: { label: "코드 소스", shortLabel: "코드", tone: "blue", description: "에디터·파일·코드 작업 근거" },
  terminal: { label: "터미널 소스", shortLabel: "터미널", tone: "gray", description: "명령줄 또는 셸 근거" },
  git: { label: "Git 소스", shortLabel: "Git", tone: "green", description: "Git diff·커밋·브랜치·저장소 근거" },
  design: { label: "디자인 소스", shortLabel: "디자인", tone: "cyan", description: "디자인 산출물 또는 디자인 도구 근거" },
  tracker: { label: "이슈 트래커 소스", shortLabel: "이슈", tone: "orange", description: "이슈 트래커 또는 프로젝트 관리 근거" },
  docs: { label: "문서 소스", shortLabel: "문서", tone: "gray", description: "문서·노트·지식베이스 근거" },
  communication: { label: "대화 소스", shortLabel: "메시지", tone: "cyan", description: "토론 또는 팀 메시지 근거" },
  research: { label: "리서치 소스", shortLabel: "웹", tone: "cyan", description: "브라우저·URL·리서치 근거" },
  build: { label: "빌드 소스", shortLabel: "빌드", tone: "orange", description: "빌드 또는 테스트 로그 근거" },
  deploy: { label: "배포 소스", shortLabel: "배포", tone: "green", description: "배포 또는 릴리스 근거" },
  automation: { label: "자동화 소스", shortLabel: "자동화", tone: "purple", description: "자동화 또는 예약 에이전트 근거" },
  manual: { label: "수동 입력 소스", shortLabel: "노트", tone: "gray", description: "사용자가 직접 입력한 노트 또는 맥락" },
  unknown: { label: "분류 전 소스", shortLabel: "소스", tone: "gray", description: "아직 분류되지 않은 소스 근거" },
};

const ACTIVITY_VISUALS: Record<ActivityKind, ActivityVisuals> = {
  conversation: { label: "대화", shortLabel: "대화", tone: "purple", description: "사람·AI·토론 발언" },
  explore: { label: "탐색", shortLabel: "탐색", tone: "cyan", description: "파일 읽기·검색 (Read·Grep·Glob·LS)" },
  command: { label: "명령", shortLabel: "명령", tone: "gray", description: "터미널 또는 도구 명령 활동" },
  fileChange: { label: "파일 변경", shortLabel: "파일", tone: "blue", description: "파일·에디터·코드 변경" },
  commit: { label: "커밋", shortLabel: "커밋", tone: "green", description: "Git 커밋 또는 저장소 체크포인트" },
  diff: { label: "Git 변경", shortLabel: "Diff", tone: "green", description: "Git diff 또는 변경 묶음" },
  designChange: { label: "디자인 변경", shortLabel: "디자인", tone: "cyan", description: "디자인 산출물 또는 프레임 변경" },
  issueUpdate: { label: "이슈 업데이트", shortLabel: "이슈", tone: "orange", description: "이슈·티켓·트래커 업데이트" },
  decision: { label: "결정", shortLabel: "결정", tone: "green", description: "기록된 결정 또는 근거" },
  reviewItem: { label: "검토 항목", shortLabel: "검토", tone: "orange", description: "검토 이슈·결정·다음 행동" },
  note: { label: "노트", shortLabel: "노트", tone: "gray", description: "수동 노트 또는 문서 노트" },
  urlReference: { label: "URL 참조", shortLabel: "URL", tone: "cyan", description: "URL·브라우저·리서치 참조" },
  buildRun: { label: "빌드 실행", shortLabel: "빌드", tone: "orange", description: "빌드 활동 또는 테스트 실행" },
  testRun: { label: "테스트 실행", shortLabel: "테스트", tone: "orange", description: "테스트 실행 또는 테스트 로그" },
  deploy: { label: "배포", shortLabel: "배포", tone: "green", description: "배포 또는 릴리스 활동" },
  report: { label: "보고서", shortLabel: "보고서", tone: "blue", description: "보고서 출력 또는 생성된 산출물" },
  handoff: { label: "이어가기", shortLabel: "이어가기", tone: "blue", description: "다음 세션·공유용 출력" },
  memory: { label: "메모리", shortLabel: "메모리", tone: "purple", description: "프로젝트 메모리 또는 지속 맥락 이벤트" },
  sourceImport: { label: "소스 가져오기", shortLabel: "가져오기", tone: "cyan", description: "캡처된 소스 또는 가져오기 경계" },
  automationRun: { label: "자동화 실행", shortLabel: "자동화", tone: "purple", description: "자동화 또는 에이전트 실행 활동" },
  artifact: { label: "산출물", shortLabel: "산출물", tone: "blue", description: "생성된 작업 산출물" },
  unknown: { label: "활동", shortLabel: "활동", tone: "gray", description: "분류되지 않은 활동" },
};

// Lanes get their own concise nouns rather than reusing the (longer) activity
// labels, so a lane / conversation-flow group header reads as one calm word.
const LANE_VISUALS: Record<ActivityLaneId, ActivityVisuals> = {
  conversation: { label: "대화", shortLabel: "대화", tone: "purple", description: "사람·AI·토론 발언" },
  explore: { label: "탐색", shortLabel: "탐색", tone: "cyan", description: "파일 읽기·검색 (Read·Grep·Glob·LS)" },
  command: { label: "명령", shortLabel: "명령", tone: "gray", description: "터미널 또는 도구 명령" },
  files: { label: "파일", shortLabel: "파일", tone: "blue", description: "파일·코드·문서 변경, Git diff·커밋 포함" },
  git: { label: "Git", shortLabel: "Git", tone: "green", description: "Diff·커밋·저장소 맥락" },
  design: { label: "디자인", shortLabel: "디자인", tone: "cyan", description: "디자인 산출물 및 프레임 변경" },
  tracker: { label: "이슈", shortLabel: "이슈", tone: "orange", description: "이슈·티켓·트래커 업데이트" },
  docs: { label: "문서", shortLabel: "문서", tone: "gray", description: "문서 및 노트" },
  research: { label: "리서치", shortLabel: "리서치", tone: "cyan", description: "URL·브라우저·리서치 참조" },
  build: { label: "빌드", shortLabel: "빌드", tone: "orange", description: "빌드 활동 및 테스트 실행" },
  deploy: { label: "배포", shortLabel: "배포", tone: "green", description: "배포 또는 릴리스 활동" },
  automation: { label: "자동화", shortLabel: "자동화", tone: "purple", description: "자동화 또는 에이전트 실행" },
  review: { label: "검토", shortLabel: "검토", tone: "orange", description: "결정·이슈·다음 행동" },
  handoff: { label: "이어가기", shortLabel: "이어가기", tone: "blue", description: "다음 세션·공유용 출력" },
  memory: { label: "메모리", shortLabel: "메모리", tone: "purple", description: "프로젝트 메모리 또는 지속 맥락" },
  notes: { label: "노트", shortLabel: "노트", tone: "gray", description: "수동 노트 또는 문서 노트" },
  unknown: { label: "활동", shortLabel: "활동", tone: "gray", description: "분류되지 않은 활동" },
};

export function buildSourceIndex(sources: readonly SourceRef[]): Map<string, SourceRef> {
  return new Map(sources.map((source) => [source.id, source]));
}

export function getEventSources(
  event: TimelineEvent,
  sourceIndexOrSources: ReadonlyMap<string, SourceRef> | readonly SourceRef[],
): SourceRef[] {
  const sourceIndex =
    typeof (sourceIndexOrSources as ReadonlyMap<string, SourceRef>).get === "function"
      ? (sourceIndexOrSources as ReadonlyMap<string, SourceRef>)
      : buildSourceIndex(sourceIndexOrSources as readonly SourceRef[]);
  return event.sourceRefs
    .map((sourceId) => sourceIndex.get(sourceId))
    .filter((source): source is SourceRef => Boolean(source));
}

export function deriveSourceFamily(kind: string | null | undefined): TimelineSourceFamily {
  switch (kind) {
    case "aiConversation":
    case "claudeTranscript":
    case "chatgptTranscript":
    case "codexTranscript":
    case "desktopTranscriptImport":
    case "cursor":
      return "ai";
    case "gitDiff":
    case "tauriGitDiff":
    case "git":
    case "gitCommand":
    case "githubPrImport":
    case "repository":
      return "git";
    case "file":
    case "fileSystem":
    case "editor":
    case "vscode":
      return "code";
    case "terminal":
    case "terminalShell":
      return "terminal";
    case "browser":
    case "browserTab":
    case "url":
      return "research";
    case "docs":
    case "notion":
    case "documentNote":
      return "docs";
    case "slack":
    case "discord":
      return "communication";
    case "figma":
      return "design";
    case "linear":
    case "jira":
    case "githubIssue":
      return "tracker";
    case "build":
    case "buildLog":
      return "build";
    case "deploy":
    case "deployLog":
      return "deploy";
    case "automation":
      return "automation";
    case "manualNote":
      return "manual";
    default:
      return "unknown";
  }
}

export function deriveActivityKind(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): ActivityKind {
  const sources = args.sources ? getEventSources(args.event, args.sources) : [];
  const families = eventSourceFamilies(args.event, sources);
  const primaryFamily = families[0] ?? "unknown";
  const titleAndSummary = `${args.event.title} ${args.event.summary}`.toLocaleLowerCase();

  // Structural signals from the importer are ground truth and classify before
  // any fuzzy text match. A tool turn is routed by its tool name, so Edit /
  // Write become file changes and WebFetch becomes research instead of every
  // tool collapsing into the command lane — and so a keyword the work merely
  // mentions ("memory") never hijacks a tool event.
  if (args.event.actor === "tool") {
    return toolActivityKind(args.event.toolName, titleAndSummary);
  }
  if (args.event.actor === "file") return "fileChange";
  if (args.event.actor === "decision") return "decision";
  // An imported user/assistant turn is conversation, full stop. A keyword the
  // discussion merely mentions ("memory", "report", "test") must not reclassify
  // a real chat turn — that mislabeled a memory-focused conversation as memory
  // events. Fuzzy text heuristics apply only to events with no conversational
  // actor (connector / demo events where actor is unset).
  if (args.event.actor === "user" || args.event.actor === "assistant") {
    return "conversation";
  }

  if (looksLikeMemory(titleAndSummary)) return "memory";
  if (looksLikeHandoff(titleAndSummary)) return "handoff";
  if (looksLikeReport(titleAndSummary)) return "report";
  if (looksLikeTest(titleAndSummary)) return "testRun";

  if (sources.length === 0) {
    // actor tool / file / decision already returned above; classify by type.
    switch (args.event.type) {
      case "aiConversation":
        return "conversation";
      case "decision":
        return "decision";
      case "issue":
        return "issueUpdate";
      case "fileCode":
        return "fileChange";
      case "webResearch":
        return "urlReference";
      case "documentNote":
        return "note";
      case "artifact":
        return "artifact";
      case "other":
      default:
        return "unknown";
    }
  }

  if (primaryFamily === "build") return "buildRun";
  if (primaryFamily === "deploy") return "deploy";
  if (primaryFamily === "design") return "designChange";
  if (primaryFamily === "tracker") return "issueUpdate";
  if (primaryFamily === "automation") return "automationRun";
  if (primaryFamily === "git") {
    if (/commit|revision|sha\b|hash\b/.test(titleAndSummary)) return "commit";
    return "diff";
  }
  if (primaryFamily === "terminal") return "command";
  if (primaryFamily === "research") return "urlReference";
  if (primaryFamily === "manual") return "note";
  if (primaryFamily === "docs" || primaryFamily === "communication") return "note";

  // actor tool / file / decision already returned above; classify by type.
  switch (args.event.type) {
    case "aiConversation":
      return "conversation";
    case "decision":
      return "decision";
    case "issue":
      return "issueUpdate";
    case "fileCode":
      return "fileChange";
    case "webResearch":
      return "urlReference";
    case "documentNote":
      return "note";
    case "artifact":
      return "artifact";
    case "other":
    default:
      return "unknown";
  }
}

/**
 * Map a tool event to an activity kind using the parsed `toolName` (set by
 * the Claude import). File-mutating tools are real code/file changes; web
 * tools are research; a shell command that looks like a test run is a test;
 * everything else (Read / Grep / Glob / generic Bash / unnamed) is a command.
 */
function toolActivityKind(toolName: string | undefined, text: string): ActivityKind {
  const name = (toolName ?? "").trim().toLowerCase();
  if (/^(edit|write|multiedit|notebookedit|update|create|applypatch|str_replace)/.test(name)) {
    return "fileChange";
  }
  if (name.startsWith("web")) return "urlReference";
  if (/^(bash|shell|run|exec|sh)$/.test(name)) {
    return looksLikeTest(text) ? "testRun" : "command";
  }
  // Read-only exploration tools — the agent looking around, not running or
  // changing anything — read as their own "탐색" activity.
  if (/^(read|grep|glob|ls|list|find|cat|search|view|tree|head|tail)/.test(name)) {
    return "explore";
  }
  return "command";
}

export function getTimelineLaneForEvent(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): ActivityLaneId {
  const kind = deriveActivityKind(args);
  switch (kind) {
    case "conversation":
      return "conversation";
    case "explore":
      return "explore";
    case "command":
      return "command";
    case "fileChange":
    case "commit":
    case "diff":
      // Git diff / commit activity folds into the unified 코드·파일 lane —
      // it stays distinguishable via the event's activity badge (Diff / 커밋),
      // but vibe coders read one "what changed" lane rather than a separate Git
      // swimlane.
      return "files";
    case "designChange":
      return "design";
    case "issueUpdate":
      return "tracker";
    case "decision":
    case "reviewItem":
      return "review";
    case "note":
      return eventLooksManual(args.event, args.sources) ? "notes" : "docs";
    case "urlReference":
      return "research";
    case "buildRun":
    case "testRun":
      return "build";
    case "deploy":
      return "deploy";
    case "automationRun":
    case "sourceImport":
      return "automation";
    case "report":
    case "handoff":
    case "artifact":
      return "handoff";
    case "memory":
      return "memory";
    case "unknown":
    default:
      return "unknown";
  }
}

export function getActivityVisuals(kind: ActivityKind): ActivityVisuals {
  return ACTIVITY_VISUALS[kind] ?? ACTIVITY_VISUALS.unknown;
}

export function getActivityLaneVisuals(lane: ActivityLaneId): ActivityVisuals {
  return LANE_VISUALS[lane] ?? LANE_VISUALS.unknown;
}

export function getSourceFamilyVisuals(family: TimelineSourceFamily): ActivityVisuals {
  return SOURCE_FAMILY_VISUALS[family] ?? SOURCE_FAMILY_VISUALS.unknown;
}

const IMPORTANCE_LABELS: Record<EventImportance, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

/** Korean label for an event's derived importance, for inspector display. */
export function getImportanceLabel(importance: EventImportance): string {
  return IMPORTANCE_LABELS[importance] ?? IMPORTANCE_LABELS.low;
}

/**
 * Join a lane/category label with an activity label for a compact meta line,
 * collapsing to one token when they are identical. Many events sit in a lane
 * named after their own activity (대화 / 대화, 파일 / 파일), so without this a
 * card or row would print the same word twice.
 */
export function joinActivityMeta(primary: string, secondary: string): string {
  return primary === secondary ? primary : `${primary} · ${secondary}`;
}

export function getEventImportance(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): EventImportance {
  const kind = deriveActivityKind(args);
  if (
    kind === "decision" ||
    kind === "handoff" ||
    kind === "report" ||
    args.event.linkedDecisionIds.length > 0 ||
    args.event.linkedIssueIds.length >= 2 ||
    args.event.sourceRefs.length > 1
  ) {
    return "high";
  }
  if (
    kind === "issueUpdate" ||
    kind === "diff" ||
    kind === "commit" ||
    kind === "buildRun" ||
    kind === "deploy" ||
    args.event.trustLevel === "inferred"
  ) {
    return "medium";
  }
  return "low";
}

export function getEventEvidenceRefs(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
  max?: number;
}): TimelineEvidenceChip[] {
  const sources = args.sources ? getEventSources(args.event, args.sources) : [];
  const chips = sources.map((source): TimelineEvidenceChip => {
    const family = deriveSourceFamily(source.kind);
    return {
      id: `source:${source.id}`,
      sourceId: source.id,
      sourceFamily: family,
      label: source.title || getSourceFamilyVisuals(family).label,
      shortLabel: compactSourceLabel(source.title, getSourceFamilyVisuals(family).shortLabel),
      trustLevel: source.trustLevel,
      retention: source.rawRetention,
      linked: Boolean(source.uri),
    };
  });

  if (chips.length === 0 && args.event.connectorEventId) {
    const connector = args.event.connectorEventId.split("::")[0] || "connector";
    chips.push({
      id: `connector:${args.event.connectorEventId}`,
      sourceId: null,
      sourceFamily: "automation",
      label: connector,
      shortLabel: connector,
      trustLevel: args.event.trustLevel,
      retention: null,
      linked: false,
    });
  }

  return typeof args.max === "number" ? chips.slice(0, args.max) : chips;
}

export function summarizeEventForDensity(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
  density: TimelineDensity;
}): string | null {
  const descriptor = buildEventActivityDescriptor({
    event: args.event,
    sources: args.sources,
    density: args.density,
  });
  if (args.density === "dense") return descriptor.activityVisuals.shortLabel;
  if (descriptor.evidenceChips.length > 0) {
    const first = descriptor.evidenceChips[0]!;
    const more = descriptor.evidenceChips.length - 1;
    return more > 0 ? `${first.shortLabel} +${more}` : first.shortLabel;
  }
  return descriptor.activityVisuals.shortLabel;
}

export function buildEventActivityDescriptor(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
  density?: TimelineDensity;
}): EventActivityDescriptor {
  const sourceIndex = args.sources
    ? Array.isArray(args.sources)
      ? buildSourceIndex(args.sources)
      : args.sources
    : new Map<string, SourceRef>();
  const sources = getEventSources(args.event, sourceIndex);
  const sourceFamilies = eventSourceFamilies(args.event, sources);
  const sourceFamily = sourceFamilies[0] ?? "unknown";
  const activityKind = deriveActivityKind({ event: args.event, sources: sourceIndex });
  const lane = getTimelineLaneForEvent({ event: args.event, sources: sourceIndex });
  const evidenceChips = getEventEvidenceRefs({
    event: args.event,
    sources: sourceIndex,
    max: args.density === "dense" ? 1 : 3,
  });
  const activityVisuals = getActivityVisuals(activityKind);
  const laneVisuals = getActivityLaneVisuals(lane);
  const sourceVisuals = getSourceFamilyVisuals(sourceFamily);
  const importance = getEventImportance({ event: args.event, sources: sourceIndex });
  const linkCount =
    args.event.linkedDecisionIds.length +
    args.event.linkedIssueIds.length +
    (args.event.artifactIds?.length ?? 0);
  const metadataParts = [
    activityVisuals.shortLabel,
    sourceVisuals.shortLabel,
    evidenceChips.length > 0 ? `근거 ${evidenceChips.length}` : null,
    linkCount > 0 ? `연결 ${linkCount}` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    sourceFamily,
    sourceFamilies,
    activityKind,
    lane,
    activityVisuals,
    laneVisuals,
    sourceVisuals,
    importance,
    evidenceChips,
    metadataLine: metadataParts.join(" / "),
    densitySummary: summarizeEventForDensityWithoutRecursing({
      activityVisuals,
      evidenceChips,
      density: args.density ?? "compact",
    }),
  };
}

export function groupEventsByActivityLane(args: {
  events: readonly TimelineEvent[];
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): Record<ActivityLaneId, TimelineEvent[]> {
  const groups = Object.fromEntries(
    timelineActivityLaneOrder.map((lane) => [lane, [] as TimelineEvent[]]),
  ) as Record<ActivityLaneId, TimelineEvent[]>;
  const sourceIndex = args.sources
    ? Array.isArray(args.sources)
      ? buildSourceIndex(args.sources)
      : args.sources
    : new Map<string, SourceRef>();
  for (const event of args.events) {
    groups[getTimelineLaneForEvent({ event, sources: sourceIndex })].push(event);
  }
  return groups;
}

function eventSourceFamilies(
  event: TimelineEvent,
  sources: readonly SourceRef[],
): TimelineSourceFamily[] {
  const seen = new Set<TimelineSourceFamily>();
  for (const source of sources) seen.add(deriveSourceFamily(source.kind));
  if (seen.size === 0) {
    if (event.connectorEventId) seen.add("automation");
    else seen.add(deriveFamilyFromEvent(event));
  }
  return [...seen].sort((left, right) => sourceFamilyRank(left) - sourceFamilyRank(right));
}

function deriveFamilyFromEvent(event: TimelineEvent): TimelineSourceFamily {
  if (event.actor === "tool") return "terminal";
  if (event.actor === "file") return "code";
  switch (event.type) {
    case "aiConversation":
      return "ai";
    case "fileCode":
      return "code";
    case "webResearch":
      return "research";
    case "documentNote":
      return "docs";
    case "decision":
    case "issue":
      return "tracker";
    case "artifact":
      return "code";
    case "other":
    default:
      return "unknown";
  }
}

function sourceFamilyRank(family: TimelineSourceFamily): number {
  return [
    "ai",
    "terminal",
    "code",
    "git",
    "design",
    "tracker",
    "docs",
    "communication",
    "research",
    "build",
    "deploy",
    "automation",
    "manual",
    "unknown",
  ].indexOf(family);
}

function eventLooksManual(
  event: TimelineEvent,
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>,
): boolean {
  const eventSources = sources ? getEventSources(event, sources) : [];
  return eventSources.some((source) => deriveSourceFamily(source.kind) === "manual");
}

function compactSourceLabel(title: string, fallback: string): string {
  const trimmed = title.trim();
  if (!trimmed) return fallback;
  const withoutPath = trimmed.split(/[\\/]/).filter(Boolean).pop() ?? trimmed;
  return withoutPath.length > 18 ? `${withoutPath.slice(0, 16)}...` : withoutPath;
}

function summarizeEventForDensityWithoutRecursing(args: {
  activityVisuals: ActivityVisuals;
  evidenceChips: TimelineEvidenceChip[];
  density: TimelineDensity;
}): string | null {
  if (args.density === "dense") return args.activityVisuals.shortLabel;
  if (args.evidenceChips.length === 0) return args.activityVisuals.shortLabel;
  const first = args.evidenceChips[0]!;
  const more = args.evidenceChips.length - 1;
  return more > 0 ? `${first.shortLabel} +${more}` : first.shortLabel;
}

function looksLikeReport(text: string): boolean {
  return /\breport\b|markdown|summary report/.test(text);
}

function looksLikeHandoff(text: string): boolean {
  return /\bhandoff\b|resume prompt|continuation prompt|\.mori\b/.test(text);
}

function looksLikeMemory(text: string): boolean {
  return /\bmemory\b|accepted memory|project memory|remember/.test(text);
}

function looksLikeTest(text: string): boolean {
  return /\btest\b|vitest|jest|pytest|cargo test|npm test/.test(text);
}
