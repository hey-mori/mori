import type { Session, SourceRef, TimelineEvent } from "../../domain/types";

export type SourceFamily =
  | "ai"
  | "code"
  | "terminal"
  | "research"
  | "document"
  | "design"
  | "communication"
  | "tracker"
  | "automation"
  | "manual"
  | "mixed"
  | "unknown";

export type SessionOriginSummary = {
  boundaryLabel: string;
  sourceMixLabel: string;
  sourceCountLabel: string;
  eventCountLabel: string;
  projectHint: string | null;
  statusLabel: string;
  retentionLabel: string;
  trustLabel: string;
  sourceFamilies: SourceFamily[];
  isMixedSource: boolean;
};

const SOURCE_FAMILY_LABEL: Record<SourceFamily, string> = {
  ai: "AI 작업",
  code: "코드/변경",
  terminal: "터미널",
  research: "리서치",
  document: "문서/노트",
  design: "디자인",
  communication: "논의",
  tracker: "이슈/프로젝트",
  automation: "자동화",
  manual: "수동 메모",
  mixed: "혼합 출처",
  unknown: "출처",
};

const STATUS_LABEL: Record<Session["status"], string> = {
  recording: "캡처 중",
  analyzing: "분석 중",
  complete: "완료",
};

export function buildSessionOriginSummary(args: {
  session: Session;
  sources: readonly SourceRef[];
  events: readonly TimelineEvent[];
  importCount: number;
  isDemo: boolean;
}): SessionOriginSummary {
  const families = distinctSourceFamilies(args.sources);
  const isMixedSource = families.length > 1;
  const sourceMixLabel = sourceMixLabelFor(families);
  const sourceCount = args.sources.length || args.importCount;
  const projectHint = args.session.sourceLabel?.trim() || null;

  return {
    boundaryLabel: boundaryLabelFor({
      isDemo: args.isDemo,
      importCount: args.importCount,
      sourceCount,
    }),
    sourceMixLabel,
    sourceCountLabel: formatCount(sourceCount, "source"),
    eventCountLabel: formatCount(args.events.length, "event"),
    projectHint,
    statusLabel: STATUS_LABEL[args.session.status] ?? args.session.status,
    retentionLabel: retentionLabelFor(args.sources),
    trustLabel: trustLabelFor(args.sources, args.events),
    sourceFamilies: families,
    isMixedSource,
  };
}

export function sourceFamilyForKind(kind: string): SourceFamily {
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
    case "file":
    case "fileSystem":
    case "editor":
    case "vscode":
      return "code";
    case "terminal":
    case "terminalShell":
      return "terminal";
    case "url":
    case "browser":
    case "browserTab":
    case "webResearch":
      return "research";
    case "manualNote":
      return "manual";
    case "documentNote":
    case "docs":
    case "notion":
      return "document";
    case "figma":
      return "design";
    case "slack":
    case "discord":
      return "communication";
    case "linear":
    case "jira":
    case "githubIssue":
      return "tracker";
    case "build":
    case "buildLog":
    case "deploy":
    case "deployLog":
    case "automation":
      return "automation";
    default:
      return "unknown";
  }
}

function distinctSourceFamilies(sources: readonly SourceRef[]): SourceFamily[] {
  const seen = new Set<SourceFamily>();
  for (const source of sources) {
    seen.add(sourceFamilyForKind(source.kind));
  }
  return [...seen].sort((a, b) => familyRank(a) - familyRank(b));
}

function familyRank(family: SourceFamily): number {
  const order: SourceFamily[] = [
    "ai",
    "code",
    "terminal",
    "research",
    "document",
    "design",
    "communication",
    "tracker",
    "automation",
    "manual",
    "unknown",
  ];
  return order.indexOf(family);
}

function sourceMixLabelFor(families: SourceFamily[]): string {
  if (families.length === 0) return "자료 없음";
  if (families.length === 1) return SOURCE_FAMILY_LABEL[families[0]!];
  const firstTwo = families.slice(0, 2).map((family) => SOURCE_FAMILY_LABEL[family]);
  const overflow = families.length - firstTwo.length;
  return overflow > 0
    ? `${SOURCE_FAMILY_LABEL.mixed}: ${firstTwo.join(" + ")} +${overflow}`
    : `${SOURCE_FAMILY_LABEL.mixed}: ${firstTwo.join(" + ")}`;
}

function boundaryLabelFor(args: {
  isDemo: boolean;
  importCount: number;
  sourceCount: number;
}): string {
  if (args.isDemo) return "데모 작업 단위";
  if (args.importCount > 1 || args.sourceCount > 1) return "복합 작업 단위";
  if (args.importCount === 1 || args.sourceCount === 1) return "가져온 작업 단위";
  return "수동 작업 단위";
}

function retentionLabelFor(sources: readonly SourceRef[]): string {
  if (sources.length === 0) return "보관 정책 없음";
  const retained = sources.some((source) => source.rawRetention === "retained");
  const summaryOnly = sources.some((source) => source.rawRetention === "summaryOnly");
  const deleted = sources.some((source) => source.rawRetention === "deleted");
  if (retained && !summaryOnly && !deleted) return "원본 보관";
  if (summaryOnly && !retained && !deleted) return "요약 보관";
  if (deleted && !retained && !summaryOnly) return "원본 삭제";
  return "혼합 보관";
}

function trustLabelFor(
  sources: readonly SourceRef[],
  events: readonly TimelineEvent[],
): string {
  const levels = new Set([
    ...sources.map((source) => source.trustLevel),
    ...events.map((event) => event.trustLevel),
  ]);
  if (levels.size === 0) return "신뢰 상태 없음";
  if (levels.size === 1) {
    const [level] = [...levels];
    if (level === "verified") return "Verified";
    if (level === "observed") return "Observed";
    if (level === "inferred") return "Inferred";
  }
  if (levels.has("verified") && !levels.has("inferred")) return "Verified + Observed";
  return "혼합 신뢰";
}

function formatCount(count: number, noun: string): string {
  const label = noun === "source" ? "출처" : "이벤트";
  return `${label} ${count}`;
}
