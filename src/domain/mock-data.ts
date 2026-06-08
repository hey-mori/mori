import type {
  Artifact,
  Decision,
  FileTouch,
  Issue,
  MockSession,
  NextAction,
  Project,
  Relationship,
  Session,
  SourceRef,
  Summary,
  TimelineEvent,
} from "./types";

const project: Project = {
  id: "proj-mori",
  name: "Mori Product",
  description: "Local-first AI work memory app for reconstructing how work happened.",
  createdAt: "2026-05-12T13:00:00+09:00",
  updatedAt: "2026-05-12T18:00:00+09:00",
};

const session: Session = {
  id: "sess-mori-planning",
  projectId: project.id,
  title: "Mori 앱 기획",
  startedAt: "2026-05-12T13:00:00+09:00",
  endedAt: "2026-05-12T18:00:00+09:00",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "llama3.1:8b",
  storageLocation: "~/Mori/Records",
  selectedSourceIds: ["src-claude", "src-codex", "src-cursor", "src-vscode", "src-terminal", "src-chrome", "src-finder", "src-manual", "src-git"],
  status: "recording",
};

const sources: SourceRef[] = [
  {
    id: "src-claude",
    sessionId: session.id,
    kind: "aiConversation",
    title: "Claude Code product planning transcript",
    detail: "18 messages about positioning, timeline UI, privacy, and MVP scope.",
    trustLevel: "verified",
    redactionStatus: "redacted",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-12T13:02:00+09:00",
    relatedEventIds: ["evt-claude-start", "evt-positioning", "evt-mvp-scope"],
  },
  {
    id: "src-chrome",
    sessionId: session.id,
    kind: "browser",
    title: "Chrome selected competitor tabs",
    detail: "Dayflow, screenpipe, SpecStory, Pieces, and Microsoft Recall pages explicitly added.",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "retained",
    capturedAt: "2026-05-12T14:18:00+09:00",
    relatedEventIds: ["evt-dayflow", "evt-screenpipe", "evt-specstory", "evt-pieces", "evt-recall"],
  },
  {
    id: "src-git",
    sessionId: session.id,
    kind: "gitDiff",
    title: "Git diff snapshot",
    detail: "README, architecture doc, timeline parser, and report template changes.",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "retained",
    capturedAt: "2026-05-12T16:08:00+09:00",
    relatedEventIds: ["evt-readme", "evt-architecture", "evt-parser", "evt-report-template"],
  },
  {
    id: "src-terminal",
    sessionId: session.id,
    kind: "terminal",
    title: "Terminal command summary",
    detail: "Local project commands summarized without raw stdout retention.",
    trustLevel: "observed",
    redactionStatus: "pending",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-12T15:28:00+09:00",
    relatedEventIds: ["evt-parser"],
  },
  {
    id: "src-manual",
    sessionId: session.id,
    kind: "manualNote",
    title: "User positioning note",
    detail: "Mori is work-flow reconstruction, not searchable memory.",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "retained",
    capturedAt: "2026-05-12T14:37:00+09:00",
    relatedEventIds: ["evt-positioning", "evt-start-flow"],
  },
];

const events: TimelineEvent[] = [
  event("evt-claude-start", "13:02", "aiConversation", "Claude Code 대화 시작", "Mori의 방향성과 제품 본질을 논의하기 시작함.", ["src-claude"], "verified", 0.95, []),
  event("evt-manual-sketch", "13:45", "documentNote", "아이디어 스케치", "초기 컨셉과 타깃 사용자를 수동 메모로 정리.", ["src-manual"], "verified", 0.98, []),
  event("evt-readme", "13:55", "fileCode", "README.md 생성", "제품 개요와 실행 방향을 문서화.", ["src-git"], "verified", 0.96, [], [], [], ["art-readme"]),
  event("evt-competitor-research", "14:02", "aiConversation", "경쟁 제품 조사 방향 설정", "Dayflow, screenpipe, SpecStory, Pieces를 비교해 차별화 질문을 정리.", ["src-claude"], "observed", 0.83, []),
  event("evt-dayflow", "14:18", "webResearch", "Dayflow 조사", "시간 추적과 작업 회고 제품의 포지션을 확인.", ["src-chrome"], "verified", 0.9, []),
  event("evt-architecture", "14:22", "fileCode", "mori_architecture.md 작성", "Tauri, SQLite, local LLM, .mori 패키지 구조 초안 작성.", ["src-git"], "verified", 0.96, [], [], [], ["art-architecture"]),
  event("evt-screenpipe", "14:25", "webResearch", "screenpipe 조사", "로컬 화면/오디오 기록 제품과 Mori의 프라이버시 경계를 비교.", ["src-chrome"], "verified", 0.9, []),
  event("evt-specstory", "14:32", "webResearch", "SpecStory 조사", "AI coding history 제품과 Mori의 timeline-first 차이를 확인.", ["src-chrome"], "verified", 0.9, []),
  event("evt-positioning", "14:37", "aiConversation", "핵심 포지션 변경", "기억 검색이 아니라 선택한 작업 세션의 흐름 복원으로 포지션을 변경.", ["src-claude", "src-manual"], "inferred", 0.86, [], ["dec-timeline-first", "dec-flow-focus"]),
  event("evt-start-flow", "14:37", "decision", "24/7 기록 대신 Start Mori", "프라이버시 부담을 줄이기 위해 명시적 세션 기반 기록을 채택.", ["src-manual"], "inferred", 0.88, [], ["dec-start-mori"]),
  event("evt-pieces", "14:38", "webResearch", "Pieces 조사", "개발자 메모리 제품의 검색/저장 중심 UX를 분석.", ["src-chrome"], "verified", 0.9, []),
  event("evt-mvp-scope", "15:05", "aiConversation", "MVP 범위 논의", "타임라인 · 흐름 · 이슈 · 결정 · 리포트로 MVP 범위를 좁힘.", ["src-claude"], "inferred", 0.84, [], ["dec-markdown-first"]),
  event("evt-local-llm-issue", "15:05", "issue", "로컬 LLM 연결 방식 미정", "Ollama, LM Studio, OpenAI-compatible endpoint 중 기본 연결 방식을 결정해야 함.", ["src-claude"], "inferred", 0.82, ["iss-local-llm"]),
  event("evt-recall", "15:10", "webResearch", "Microsoft Recall 조사", "항상 기록형 제품이 만드는 프라이버시 불안을 분석.", ["src-chrome"], "verified", 0.9, []),
  event("evt-local-llm-priority", "15:20", "decision", "로컬 LLM 우선", "기본 분석 엔진은 Ollama 우선, LM Studio와 OpenAI-compatible endpoint는 선택 옵션.", ["src-claude"], "inferred", 0.87, [], ["dec-local-llm"]),
  event("evt-parser", "15:28", "fileCode", "timeline_parser.py 수정", "이벤트 정규화와 관계 추출 프로토타입을 보완.", ["src-git", "src-terminal"], "verified", 0.93, [], [], [], ["art-parser"]),
  event("evt-collection-risk", "15:42", "issue", "데이터 수집 범위 과도 가능성", "모든 데스크톱 작업을 읽는다는 인상을 피하고 신뢰 가능한 소스만 수집해야 함.", ["src-claude"], "inferred", 0.84, ["iss-collection-risk"]),
  event("evt-issue-created", "15:42", "aiConversation", "이슈 생성", "열린 제품 / 기술 이슈를 후보로 추출.", ["src-claude"], "inferred", 0.8, ["iss-local-llm", "iss-collection-risk", "iss-mori-schema", "iss-report-template"]),
  event("evt-next-actions", "15:45", "documentNote", "다음 액션 정리", "데이터 수집 범위, .mori 스키마, 리포트 템플릿을 다음 작업으로 표시.", ["src-manual"], "verified", 0.96, []),
  event("evt-mvp-target", "15:55", "decision", "MVP 타깃 확정", "바이브 코더와 AI 작업자를 1차 타깃으로 확정하고 프리랜서 모드를 후속으로 둠.", ["src-claude"], "inferred", 0.83, [], ["dec-summary-default"]),
  event("evt-report-template", "16:05", "fileCode", "report_template.md 생성", "개인 회고, 팀 공유, 고객 보고, standup 리포트의 Markdown 템플릿 초안 생성.", ["src-git"], "verified", 0.94, [], ["dec-markdown-first"], [], ["art-report-template"]),
  event("evt-mori-schema", "16:10", "issue", ".mori 파일 스키마 정의 필요", "manifest, events.jsonl, relationships.json, sources, summaries 구조 확정 필요.", ["src-claude"], "inferred", 0.81, ["iss-mori-schema"]),
  event("evt-report-issue", "16:25", "issue", "리포트 템플릿 구조 정의", "공유 대상별 리포트 포함 항목과 프라이버시 옵션을 명확히 해야 함.", ["src-claude", "src-git"], "inferred", 0.8, ["iss-report-template"]),
  event("evt-meeting-note", "16:30", "documentNote", "회의 메모", "내부 공유용 결정 요약과 다음 액션을 기록.", ["src-manual"], "verified", 0.96, []),
];

// Demo file provenance — attach representative file touches to the file-code
// turns so the timeline card diffstat chip, the event inspector's "이 턴이 만진
// 파일" section, and the session file panel all show real-looking provenance in
// the demo session. `messageId` ties each touch to its own event id.
function demoTouch(
  eventId: string,
  path: string,
  tool: string,
  changeKind: FileTouch["changeKind"],
  additions: number,
  deletions: number,
  diffPreview = "",
): FileTouch {
  return { path, tool, changeKind, at: "", additions, deletions, messageId: eventId, diffPreview };
}

const demoFileTouches: Record<string, FileTouch[]> = {
  "evt-readme": [
    demoTouch("evt-readme", "C:/dev/mori/README.md", "Write", "wrote", 48, 0, "+# Mori\n+Local-first AI work memory."),
  ],
  "evt-architecture": [
    demoTouch("evt-architecture", "C:/dev/mori/docs/mori_architecture.md", "Write", "wrote", 132, 0, "+## Storage\n+Tauri + SQLite + local LLM."),
  ],
  "evt-parser": [
    demoTouch(
      "evt-parser",
      "C:/dev/mori/src/timeline_parser.py",
      "Edit",
      "edited",
      64,
      12,
      "-def parse(events):\n+def parse(events, relationships):\n+    link_related(events, relationships)",
    ),
    demoTouch("evt-parser", "C:/dev/mori/src/normalize.py", "Read", "read", 0, 0),
  ],
  "evt-report-template": [
    demoTouch("evt-report-template", "C:/dev/mori/docs/report_template.md", "Write", "wrote", 90, 4, "+## Summary\n+## Decisions\n-## TODO"),
  ],
};

for (const timelineEvent of events) {
  const touches = demoFileTouches[timelineEvent.id];
  if (touches) timelineEvent.fileTouches = touches;
}

// The same touches roll up onto the git-diff source so the session file panel
// (which reads `SourceRef.fileTouches`) shows them too.
const gitSource = sources.find((source) => source.id === "src-git");
if (gitSource) {
  gitSource.fileTouches = Object.values(demoFileTouches).flat();
}

const issues: Issue[] = [
  issue("iss-local-llm", "로컬 LLM 연결 방식 미정", "Ollama, LM Studio, OpenAI-compatible endpoint 중 기본 연결 방식을 정해야 함.", "open", "high", ["evt-local-llm-issue", "evt-local-llm-priority"], ["dec-local-llm"], "MVP에서는 Ollama를 기본값으로 두고 LM Studio는 선택 옵션으로 제공한다."),
  issue("iss-collection-risk", "데이터 수집 범위 과도 가능성", "항상 감시하는 제품처럼 보이면 신뢰를 잃을 수 있음.", "open", "medium", ["evt-collection-risk", "evt-recall"], ["dec-start-mori"], "Start Mori 기반 수집 원칙과 금지 수집 방식을 설정 화면에 명확히 노출한다."),
  issue("iss-mori-schema", ".mori 파일 구조 정의 필요", "패키지 내부 manifest/events/relationships/sources/summaries 구조를 확정해야 함.", "open", "medium", ["evt-mori-schema", "evt-architecture"], [], ".mori v0.1 schema 문서를 만들고 TypeScript 타입과 맞춘다."),
  issue("iss-report-template", "리포트 템플릿 구조 정의", "Resume, client, standup, billing report가 공유 대상별로 달라야 함.", "open", "medium", ["evt-report-issue", "evt-report-template"], ["dec-markdown-first"], "Markdown export를 우선 구현하고 PDF/HTML은 placeholder로 둔다."),
  issue("iss-flow-performance", "타임라인 성능 최적화", "이벤트가 많아지면 React DOM 카드 렌더링 비용이 커질 수 있음.", "watching", "low", ["evt-parser"], ["dec-flow-focus"], "MVP는 React+SVG로 유지하고 이벤트가 늘어나면 PixiJS를 검토한다."),
  issue("iss-resume-quality", "Resume Prompt 품질 개선", "다음 AI 세션에서 바로 이어갈 수 있는 프롬프트 구조가 필요.", "inProgress", "medium", ["evt-next-actions"], ["dec-summary-default"], "결정, 열린 이슈, 변경 파일, 다음 액션을 구조적으로 넣는다."),
  issue("iss-event-taxonomy", "이벤트 타입 분류 체계 정의", "AI 대화, 결정, 이슈, 파일/코드, 웹/조사, 문서/메모, 산출물, 기타 타입 정의.", "resolved", "medium", ["evt-mvp-scope"], ["dec-timeline-first"], "도메인 타입과 UI lane mapping을 고정한다."),
];

const decisions: Decision[] = [
  decision("dec-timeline-first", "Timeline-first UI", "Mori의 핵심 화면은 좌→우 Narrative Timeline으로 한다.", "작업 흐름은 시간 순서로 검증하기 쉽고 회고/보고서와 잘 맞는다.", ["전체 그래프 중심 UI", "세로 로그만 제공"], ["Timeline Main View가 핵심이 됨", "Trace View는 보조 기능이 됨"], ["evt-positioning"], []),
  decision("dec-flow-focus", "Flow Focus as signature interaction", "카드 hover/click으로 관련 흐름만 강조하는 Flow Focus를 대표 UX로 둔다.", "전체 그래프를 보지 않아도 결정과 이슈의 맥락을 이해할 수 있다.", ["항상 전체 그래프 표시"], ["Relationship 모델이 중요해짐", "Trace panel이 핵심 보조 UI가 됨"], ["evt-positioning", "evt-parser"], []),
  decision("dec-start-mori", "Start Mori instead of 24/7 recording", "사용자가 명시적으로 시작한 세션만 기록한다.", "프라이버시 신뢰를 확보하고 업무 단위를 명확히 하기 위해.", ["24/7 화면 기록 기본값", "모든 앱 자동 감시"], ["Session Setup이 중요한 진입 화면이 됨", "민감 앱 blocklist가 필요"], ["evt-start-flow", "evt-recall"], ["iss-collection-risk"]),
  decision("dec-local-first", "Local-first storage", "모든 데이터는 기본적으로 로컬에 저장하고 외부 전송은 명시적 opt-in으로 제한한다.", "Mori의 신뢰와 제품 철학을 지키기 위해.", ["cloud-only storage"], ["SQLite와 .mori package가 핵심 기반이 됨"], ["evt-positioning"], []),
  decision("dec-summary-default", "Summary Mode as default", "MVP 기본 기록 모드는 Summary Mode로 한다.", "원본 보관 부담을 낮추고 개인 업무 기억에 필요한 핵심만 남긴다.", ["Full Mode 기본값"], ["raw data retention 설정 필요", "원본 삭제 정책을 UI에 노출"], ["evt-mvp-target"], []),
  decision("dec-local-llm", "Ollama and LM Studio priority", "로컬 LLM은 Ollama를 기본, LM Studio와 OpenAI-compatible endpoint를 선택 옵션으로 지원한다.", "사용자 환경 다양성을 고려하면서 local-first 원칙을 유지한다.", ["Cloud API 기본값"], ["provider abstraction 필요", "분석 job queue 필요"], ["evt-local-llm-priority"], ["iss-local-llm"]),
  decision("dec-markdown-first", "Markdown export first", "리포트 export는 Markdown을 먼저 구현하고 PDF/HTML은 후속으로 둔다.", "가장 빠르게 실제 공유 가치를 만들 수 있다.", ["PDF 우선", "HTML 우선"], ["Report templates를 Markdown 기반으로 설계"], ["evt-mvp-scope", "evt-report-template"], ["iss-report-template"]),
];

const artifacts: Artifact[] = [
  { id: "art-readme", projectId: project.id, sessionId: session.id, title: "README.md", kind: "document", path: "README.md", sourceEventIds: ["evt-readme"], createdAt: "2026-05-12T13:55:00+09:00" },
  { id: "art-architecture", projectId: project.id, sessionId: session.id, title: "mori_architecture.md", kind: "document", path: "docs/architecture.md", sourceEventIds: ["evt-architecture"], createdAt: "2026-05-12T14:22:00+09:00" },
  { id: "art-parser", projectId: project.id, sessionId: session.id, title: "timeline_parser.py", kind: "code", path: "src/timeline_parser.py", sourceEventIds: ["evt-parser"], createdAt: "2026-05-12T15:28:00+09:00" },
  { id: "art-report-template", projectId: project.id, sessionId: session.id, title: "report_template.md", kind: "report", path: "docs/report_template.md", sourceEventIds: ["evt-report-template"], createdAt: "2026-05-12T16:05:00+09:00" },
];

const relationships: Relationship[] = [
  rel("rel-competitors-positioning", "evt-competitor-research", "evt-positioning", "ledTo", "Competitive research showed search memory was crowded, pushing Mori toward work-flow reconstruction.", 0.88),
  rel("rel-dayflow-positioning", "evt-dayflow", "evt-positioning", "supported", "Dayflow research clarified Mori should not become a time tracker.", 0.77),
  rel("rel-screenpipe-privacy", "evt-screenpipe", "evt-start-flow", "influencedDecision", "Privacy concerns around broad capture supported explicit Start Mori sessions.", 0.84),
  rel("rel-recall-privacy", "evt-recall", "evt-start-flow", "influencedDecision", "Recall research reinforced that 24/7 capture should not be the default.", 0.86),
  rel("rel-positioning-start", "evt-positioning", "evt-start-flow", "ledTo", "The positioning change made selected session capture the right product boundary.", 0.82),
  rel("rel-positioning-llm", "evt-positioning", "evt-local-llm-priority", "influencedDecision", "Local-first product identity influenced local LLM priority.", 0.82),
  rel("rel-mvp-target", "evt-mvp-scope", "evt-mvp-target", "producedArtifact", "MVP scope discussion produced the target user decision.", 0.79),
  rel("rel-schema-issue", "evt-architecture", "evt-mori-schema", "createdIssue", "Architecture work exposed the need to define the .mori file schema.", 0.81),
  rel("rel-report-artifact", "evt-report-template", "art-report-template", "producedArtifact", "Report work produced the Markdown report template artifact.", 0.94),
  rel("rel-parser-flow", "evt-parser", "dec-flow-focus", "supported", "Timeline parser changes supported the Flow Focus prototype.", 0.8),
  rel("rel-llm-issue-decision", "evt-local-llm-issue", "evt-local-llm-priority", "influencedDecision", "The unresolved provider issue led to a staged local LLM strategy.", 0.78),
];

const nextActions: NextAction[] = [
  { id: "act-schema", sessionId: session.id, title: "Define .mori schema v0.1", priority: "high", relatedIssueIds: ["iss-mori-schema"], relatedEventIds: ["evt-mori-schema", "evt-architecture"] },
  { id: "act-capture-boundary", sessionId: session.id, title: "Document MVP capture boundaries and forbidden collection", priority: "high", relatedIssueIds: ["iss-collection-risk"], relatedEventIds: ["evt-collection-risk", "evt-start-flow"] },
  { id: "act-llm-provider", sessionId: session.id, title: "Design local LLM provider interface for Ollama and LM Studio", priority: "medium", relatedIssueIds: ["iss-local-llm"], relatedEventIds: ["evt-local-llm-priority"] },
  { id: "act-report", sessionId: session.id, title: "Implement Markdown report export path", priority: "medium", relatedIssueIds: ["iss-report-template"], relatedEventIds: ["evt-report-template"] },
];

const summary: Summary = {
  id: "sum-mori-planning",
  sessionId: session.id,
  sessionSummary: "Mori was positioned as a local-first AI work memory app that reconstructs selected work sessions into timelines, issues, decisions, resume prompts, and reports.",
  resumePrompt: `You are continuing a product design and engineering session for Mori.

Mori is a local-first AI work memory app. It records selected AI work sessions and reconstructs how the work happened into a timeline, flow focus, issues, decisions, resume prompts, reports, and .mori packages.

Last decisions:
- Use Timeline-first UI.
- Use Flow Focus as Mori's signature interaction.
- Use Start Mori instead of 24/7 recording.
- Keep storage local-first.
- Use Summary Mode as the default recording mode.
- Prioritize Ollama and LM Studio for local LLM analysis.
- Export Markdown first.

Open issues:
1. Define .mori schema v0.1.
2. Clarify data collection boundaries and forbidden collection methods.
3. Design the local LLM provider interface.
4. Define report template structure.

Files touched:
- README.md
- docs/architecture.md
- src/timeline_parser.py
- docs/report_template.md

Continue by turning the timeline and relationship model into a production-ready implementation.`,
  reportMarkdown: "# Mori planning session report\n\nMori remembers how the work happened.",
  nextActionIds: nextActions.map((action) => action.id),
  generatedAt: "2026-05-12T18:00:00+09:00",
};

export const mockSession: MockSession = {
  project,
  session,
  sources,
  events,
  issues,
  decisions,
  relationships,
  artifacts,
  nextActions,
  summary,
};

function event(
  id: string,
  time: string,
  type: TimelineEvent["type"],
  title: string,
  summaryText: string,
  sourceRefs: string[],
  trustLevel: TimelineEvent["trustLevel"],
  confidence: number,
  linkedIssueIds: string[] = [],
  linkedDecisionIds: string[] = [],
  relationshipIds: string[] = [],
  artifactIds: string[] = [],
): TimelineEvent {
  return {
    id,
    sessionId: session.id,
    projectId: project.id,
    start: `2026-05-12T${time}:00+09:00`,
    end: undefined,
    type,
    title,
    summary: summaryText,
    sourceRefs,
    linkedIssueIds,
    linkedDecisionIds,
    relationshipIds,
    artifactIds,
    trustLevel,
    confidence,
    createdBy: trustLevel === "inferred" ? "ai" : "import",
    userModified: false,
  };
}

function issue(
  id: string,
  title: string,
  description: string,
  status: Issue["status"],
  priority: Issue["priority"],
  sourceEventIds: string[],
  relatedDecisionIds: string[],
  suggestedNextAction: string,
): Issue {
  return {
    id,
    projectId: project.id,
    sessionId: session.id,
    title,
    description,
    status,
    priority,
    sourceEventIds,
    relatedDecisionIds,
    relatedFileIds: [],
    suggestedNextAction,
    assignee: "Kim Mori",
    dueDate: status === "resolved" ? undefined : "2026-05-20",
    createdAt: "2026-05-12T15:42:00+09:00",
    updatedAt: "2026-05-12T16:30:00+09:00",
    confidence: 0.82,
    trustLevel: status === "resolved" ? "verified" : "inferred",
  };
}

function decision(
  id: string,
  title: string,
  decisionText: string,
  rationale: string,
  rejectedOptions: string[],
  impact: string[],
  sourceEventIds: string[],
  relatedIssueIds: string[],
): Decision {
  return {
    id,
    projectId: project.id,
    sessionId: session.id,
    title,
    decision: decisionText,
    rationale,
    rejectedOptions,
    impact,
    sourceEventIds,
    relatedIssueIds,
    relatedSourceIds: ["src-claude", "src-manual"],
    createdAt: "2026-05-12T14:37:00+09:00",
    importance: id === "dec-timeline-first" || id === "dec-start-mori" ? "high" : "medium",
    trustLevel: "inferred",
    confirmed: id === "dec-local-first",
  };
}

function rel(
  id: string,
  fromId: string,
  toId: string,
  type: Relationship["type"],
  reason: string,
  confidence: number,
): Relationship {
  return {
    id,
    fromId,
    fromType: fromId.startsWith("dec-") ? "decision" : fromId.startsWith("art-") ? "artifact" : "event",
    toId,
    toType: toId.startsWith("dec-") ? "decision" : toId.startsWith("art-") ? "artifact" : "event",
    type,
    reason,
    confidence,
  };
}
