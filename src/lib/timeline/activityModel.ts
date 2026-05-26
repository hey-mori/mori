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

const SOURCE_FAMILY_VISUALS: Record<TimelineSourceFamily, ActivityVisuals> = {
  ai: { label: "AI source", shortLabel: "AI", tone: "purple", description: "AI conversation or agent output" },
  code: { label: "Code source", shortLabel: "Code", tone: "blue", description: "Editor, file, or code workspace evidence" },
  terminal: { label: "Terminal source", shortLabel: "Term", tone: "gray", description: "Command-line or shell evidence" },
  git: { label: "Git source", shortLabel: "Git", tone: "green", description: "Git diff, commit, branch, or repository evidence" },
  design: { label: "Design source", shortLabel: "Design", tone: "cyan", description: "Design artifact or design-tool evidence" },
  tracker: { label: "Tracker source", shortLabel: "Issue", tone: "orange", description: "Issue tracker or project-management evidence" },
  docs: { label: "Document source", shortLabel: "Doc", tone: "gray", description: "Document, note, or knowledge-base evidence" },
  communication: { label: "Discussion source", shortLabel: "Chat", tone: "cyan", description: "Discussion or team-message evidence" },
  research: { label: "Research source", shortLabel: "Web", tone: "cyan", description: "Browser, URL, or research evidence" },
  build: { label: "Build source", shortLabel: "Build", tone: "orange", description: "Build or test-log evidence" },
  deploy: { label: "Deploy source", shortLabel: "Deploy", tone: "green", description: "Deploy or release evidence" },
  automation: { label: "Automation source", shortLabel: "Auto", tone: "purple", description: "Automation or scheduled-agent evidence" },
  manual: { label: "Manual source", shortLabel: "Note", tone: "gray", description: "User-provided note or manual context" },
  unknown: { label: "Unknown source", shortLabel: "Source", tone: "gray", description: "Unclassified source evidence" },
};

const ACTIVITY_VISUALS: Record<ActivityKind, ActivityVisuals> = {
  conversation: { label: "Conversation", shortLabel: "Talk", tone: "purple", description: "Human, AI, or discussion turn" },
  command: { label: "Command", shortLabel: "Cmd", tone: "gray", description: "Terminal or tool command activity" },
  fileChange: { label: "File change", shortLabel: "File", tone: "blue", description: "File, editor, or code change" },
  commit: { label: "Commit", shortLabel: "Commit", tone: "green", description: "Git commit or repository checkpoint" },
  diff: { label: "Diff", shortLabel: "Diff", tone: "green", description: "Git diff or change set" },
  designChange: { label: "Design change", shortLabel: "Design", tone: "cyan", description: "Design artifact or frame update" },
  issueUpdate: { label: "Issue update", shortLabel: "Issue", tone: "orange", description: "Issue, ticket, or project-tracker update" },
  decision: { label: "Decision", shortLabel: "Decision", tone: "green", description: "Recorded decision or rationale" },
  reviewItem: { label: "Review item", shortLabel: "Review", tone: "orange", description: "Review issue, decision, or next action" },
  note: { label: "Note", shortLabel: "Note", tone: "gray", description: "Manual note or document note" },
  urlReference: { label: "URL reference", shortLabel: "URL", tone: "cyan", description: "URL, browser, or research reference" },
  buildRun: { label: "Build run", shortLabel: "Build", tone: "orange", description: "Build activity or test execution" },
  testRun: { label: "Test run", shortLabel: "Test", tone: "orange", description: "Test execution or test log" },
  deploy: { label: "Deploy", shortLabel: "Deploy", tone: "green", description: "Deploy or release activity" },
  report: { label: "Report", shortLabel: "Report", tone: "blue", description: "Report output or generated artifact" },
  handoff: { label: "Handoff", shortLabel: "Handoff", tone: "blue", description: "Resume, handoff, or package output" },
  memory: { label: "Memory", shortLabel: "Memory", tone: "purple", description: "Project-memory or durable context event" },
  sourceImport: { label: "Source import", shortLabel: "Import", tone: "cyan", description: "Captured source or import boundary" },
  automationRun: { label: "Automation run", shortLabel: "Auto", tone: "purple", description: "Automation or agent-run activity" },
  artifact: { label: "Artifact", shortLabel: "Artifact", tone: "blue", description: "Produced work artifact" },
  unknown: { label: "Activity", shortLabel: "Activity", tone: "gray", description: "Unclassified activity" },
};

const LANE_VISUALS: Record<ActivityLaneId, ActivityVisuals> = {
  conversation: ACTIVITY_VISUALS.conversation,
  command: ACTIVITY_VISUALS.command,
  files: { label: "Files", shortLabel: "Files", tone: "blue", description: "File and code changes" },
  git: { label: "Git", shortLabel: "Git", tone: "green", description: "Diffs, commits, and repository context" },
  design: ACTIVITY_VISUALS.designChange,
  tracker: ACTIVITY_VISUALS.issueUpdate,
  docs: { label: "Docs", shortLabel: "Docs", tone: "gray", description: "Documents and notes" },
  research: ACTIVITY_VISUALS.urlReference,
  build: ACTIVITY_VISUALS.buildRun,
  deploy: ACTIVITY_VISUALS.deploy,
  automation: ACTIVITY_VISUALS.automationRun,
  review: { label: "Review", shortLabel: "Review", tone: "orange", description: "Decisions, issues, and next actions" },
  handoff: ACTIVITY_VISUALS.handoff,
  memory: ACTIVITY_VISUALS.memory,
  notes: ACTIVITY_VISUALS.note,
  unknown: ACTIVITY_VISUALS.unknown,
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

  if (looksLikeMemory(titleAndSummary)) return "memory";
  if (looksLikeHandoff(titleAndSummary)) return "handoff";
  if (looksLikeReport(titleAndSummary)) return "report";
  if (looksLikeTest(titleAndSummary)) return "testRun";

  if (sources.length === 0) {
    if (args.event.actor === "tool") return "command";
    if (args.event.actor === "file") return "fileChange";
    if (args.event.actor === "decision") return "decision";
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

  if (args.event.actor === "tool") return "command";
  if (args.event.actor === "file") return "fileChange";
  if (args.event.actor === "decision") return "decision";

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

export function getTimelineLaneForEvent(args: {
  event: TimelineEvent;
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>;
}): ActivityLaneId {
  const kind = deriveActivityKind(args);
  switch (kind) {
    case "conversation":
      return "conversation";
    case "command":
      return "command";
    case "fileChange":
      return "files";
    case "commit":
    case "diff":
      return "git";
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
    evidenceChips.length > 0 ? `evidence ${evidenceChips.length}` : null,
    linkCount > 0 ? `links ${linkCount}` : null,
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
