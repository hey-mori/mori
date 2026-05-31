import type { SourceKind } from "../../domain/types";
import {
  buildConnectorControlCenter,
  describeControlCenterAvailability,
  type BuildControlCenterInput,
  type ControlCenterAvailability,
  type ControlCenterImportKind,
  type ControlCenterSurface,
} from "../connectors";
import {
  SOURCE_REGISTRY,
  type IntegrationStatus,
  type RawDataPolicy,
  type SourceIntegration,
} from "./sourceRegistry";

export type SourceWorkspaceCategory =
  | "AI"
  | "Code"
  | "Git"
  | "Terminal"
  | "Docs"
  | "Design"
  | "Issue Tracker"
  | "Manual"
  | "URL"
  | "Future";

export type SourceWorkspaceStatus =
  | "available"
  | "needsSetup"
  | "needsDesktopApp"
  | "planned"
  | "unsupported";

export type SourceWorkspaceAction =
  | {
      kind: "import";
      label: string;
      enabled: boolean;
      importKind: ControlCenterImportKind;
      disabledReason?: string;
    }
  | {
      kind: "settings";
      label: string;
      enabled: boolean;
      disabledReason?: string;
    }
  | {
      kind: "none";
      label: string;
      enabled: false;
    };

export type SourceWorkspaceSource = {
  id: string;
  name: string;
  category: SourceWorkspaceCategory;
  familyLabel: string;
  status: SourceWorkspaceStatus;
  statusLabel: string;
  statusTone: string;
  acquisitionMethod: string;
  acceptedFormats: string[];
  setupMethod: string;
  pathMode: "notNeeded" | "optionalPath" | "requiredPath" | "planned";
  pathStateLabel: string;
  localOnly: boolean;
  recommended: boolean;
  privacyNote: string;
  whatMoriCanAccess: string[];
  whatMoriCannotAccess: string[];
  creates: string[];
  reviewBehavior: string;
  rawDataPolicy: RawDataPolicy | "referenceOnly";
  action: SourceWorkspaceAction;
  likelyFiles: string[];
  testsNeeded: string[];
  safeToImplementNow: boolean;
};

export type SourceWorkspaceCounts = {
  available: number;
  needsSetup: number;
  planned: number;
  localOnly: number;
};

export type SourceWorkspaceViewModel = {
  sources: SourceWorkspaceSource[];
  counts: SourceWorkspaceCounts;
  pipeline: string[];
  privacySummary: string[];
};

const FAMILY_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  git: "Git",
  terminal: "터미널",
  manual: "직접 입력",
  document: "문서",
  ide: "에디터 / IDE",
  browser: "브라우저",
  analysis: "분석",
  future: "지원 예정",
};

const CATEGORY_BY_SURFACE_ID: Partial<Record<string, SourceWorkspaceCategory>> = {
  manualNote: "Manual",
  urlImport: "URL",
  gitDiffPaste: "Git",
  tauriGitDiff: "Git",
  repositoryMetadata: "Git",
  localCaptureBridge: "Terminal",
  claudeCodeHook: "AI",
  claudeDesktopExport: "AI",
  claudeWebExport: "AI",
  codexCliWrapper: "Code",
  codexDesktopExport: "Code",
  codexWebGithub: "Code",
  openCodeCli: "Code",
  vscodeExtension: "Code",
  cursorExtension: "Code",
  terminalShellIntegration: "Terminal",
  browserExtension: "URL",
  githubPrImport: "Git",
  fileDocumentImport: "Docs",
  mcpServer: "Future",
};

const CATEGORY_BY_INTEGRATION_ID: Partial<Record<string, SourceWorkspaceCategory>> = {
  connectorJsonl: "Code",
  claudeTranscript: "AI",
  chatgptTranscript: "AI",
  codexTranscript: "Code",
  aiConversation: "AI",
  slack: "Docs",
  notion: "Docs",
  docs: "Docs",
  figma: "Design",
  linear: "Issue Tracker",
  jira: "Issue Tracker",
  discord: "Docs",
  buildLog: "Terminal",
  deployLog: "Terminal",
  automation: "Future",
  fileSystem: "Future",
};

const INPUT_FORMATS_BY_SURFACE_ID: Partial<Record<string, string[]>> = {
  manualNote: ["직접 입력 텍스트", "Markdown 메모"],
  urlImport: ["URL", "선택 발췌 텍스트"],
  aiTranscriptPaste: ["붙여넣은 transcript", "ChatGPT conversations.json"],
  gitDiffPaste: ["unified diff", "git diff 텍스트"],
  tauriGitDiff: ["명시 repo 경로", "git diff range"],
  repositoryMetadata: ["사용자가 추가한 repo 경로"],
  localCaptureBridge: ["Mori Connector JSONL", "stdin transcript", "git shortstat package"],
  claudeCodeHook: ["Claude Code hook JSONL"],
  codexCliWrapper: ["Codex wrapper JSONL"],
  openCodeCli: ["OpenCode wrapper JSONL"],
  terminalShellIntegration: ["명령 메타데이터 JSONL"],
  vscodeExtension: ["명시 캡처 task JSONL"],
  cursorExtension: ["명시 캡처 이벤트 JSONL"],
  browserExtension: ["사용자가 추가한 URL 메타데이터"],
  githubPrImport: ["PR URL", "붙여넣은 PR 본문", "diff stats"],
  fileDocumentImport: [".md", ".txt", "PDF는 지원 예정"],
  mcpServer: ["MCP host가 명시적으로 보낸 컨텍스트"],
};

const LIKELY_FILES_BY_SOURCE_ID: Partial<Record<string, string[]>> = {
  connectorJsonl: ["src/features/import/ImportPanel.tsx", "src/lib/connectors/"],
  manualNote: ["src/lib/import/normalizeManualNote.ts", "src/features/import/ImportPanel.tsx"],
  urlImport: ["src/lib/import/normalizeUrl.ts", "src/features/import/ImportPanel.tsx"],
  aiTranscriptPaste: ["src/lib/import/normalizeAiTranscript.ts", "src/features/import/ImportPanel.tsx"],
  gitDiffPaste: ["src/lib/import/normalizeGitDiff.ts", "src/lib/import/parseGitDiff.ts"],
  tauriGitDiff: ["src-tauri/src/git/diff.rs", "src/lib/desktop/tauriCommands.ts"],
  repositoryMetadata: ["src/app/repositoryStore.ts", "src/features/settings/RepositoriesCard.tsx"],
  localCaptureBridge: ["connectors/local-capture/", "src/lib/connectors/"],
  claudeCodeHook: ["connectors/claude-code/", "docs/connectors/claude-code-hook.md"],
  codexCliWrapper: ["connectors/codex-cli/", "docs/connectors/codex-cli-wrapper.md"],
  openCodeCli: ["connectors/opencode-cli/", "src/lib/connectors/captureSurfaces.ts"],
  terminalShellIntegration: ["connectors/terminal-helper/", "docs/source-integrations.md"],
  vscodeExtension: ["connectors/vscode-task/", "docs/source-integrations.md"],
};

const TESTS_BY_SOURCE_ID: Partial<Record<string, string[]>> = {
  connectorJsonl: ["connector JSONL preview", "duplicate classification", "Import Review handoff"],
  manualNote: ["normalizer", "direct session import"],
  urlImport: ["normalizer", "URL validation"],
  aiTranscriptPaste: ["turn parser", "ChatGPT export parser", "Import Review handoff"],
  gitDiffPaste: ["diff parser", "file stats", "Import Review handoff"],
  tauriGitDiff: ["desktop command", "range handling", "repository freshness"],
  repositoryMetadata: ["path verification", "no content read invariant"],
  localCaptureBridge: ["template round-trip", "summary-only invariant"],
  claudeCodeHook: ["fixture round-trip", "setup guide copy"],
  codexCliWrapper: ["fixture round-trip", "setup guide copy"],
  openCodeCli: ["fixture round-trip", "setup guide copy"],
  terminalShellIntegration: ["explicit trigger invariant", "no shell-history read"],
  vscodeExtension: ["task template fixture", "no watcher invariant"],
};

const PIPELINE = [
  "소스",
  "불러오기 / 수집",
  "미리보기",
  "검토",
  "타임라인 / 근거",
  "프로젝트 기억 후보",
  "보고서 / 이어가기",
];

const PRIVACY_SUMMARY = [
  "로컬 우선: 기본 데이터는 이 기기에 저장됩니다.",
  "숨은 수집 없음: 계정, 브라우저, 터미널, 에디터를 자동으로 읽지 않습니다.",
  "사용자가 선택한 파일, 경로, 붙여넣기, 명령 결과만 처리합니다.",
  "프로젝트 기억은 검토 후 반영합니다.",
];

const FUTURE_INTEGRATION_IDS = [
  "slack",
  "notion",
  "figma",
  "linear",
  "jira",
  "docs",
  "buildLog",
  "deployLog",
  "automation",
];

const IMPLEMENTED_IMPORT_INTEGRATION_IDS = [
  "claudeTranscript",
  "chatgptTranscript",
  "codexTranscript",
  "aiConversation",
];

function statusFromAvailability(availability: ControlCenterAvailability): SourceWorkspaceStatus {
  switch (availability) {
    case "available":
      return "available";
    case "needsSetup":
      return "needsSetup";
    case "needsDesktopApp":
      return "needsDesktopApp";
    case "planned":
      return "planned";
    case "unavailable":
      return "unsupported";
  }
}

function statusFromIntegration(status: IntegrationStatus): SourceWorkspaceStatus {
  switch (status) {
    case "implemented":
    case "partial":
      return "available";
    case "planned":
      return "planned";
    case "mockOnly":
    case "unavailable":
      return "unsupported";
  }
}

function statusLabel(status: SourceWorkspaceStatus): { label: string; tone: string } {
  switch (status) {
    case "available":
      return { label: "사용 가능", tone: "green" };
    case "needsSetup":
      return { label: "설정 필요", tone: "orange" };
    case "needsDesktopApp":
      return { label: "데스크톱 필요", tone: "blue" };
    case "planned":
      return { label: "지원 예정", tone: "gray" };
    case "unsupported":
      return { label: "미지원", tone: "gray" };
  }
}

function createsForSurface(surface: Pick<ControlCenterSurface, "id" | "label">): string[] {
  if (surface.id === "repositoryMetadata") return ["경로 설정", "검증 메타데이터"];
  return ["소스 패키지", "정규화된 이벤트", "검토 후보", "타임라인 반영 후보"];
}

function reviewBehaviorForSurface(surface: Pick<ControlCenterSurface, "id" | "label">): string {
  if (surface.id === "manualNote" || surface.id === "urlImport") {
    return "사용자가 직접 작성한 단일 항목은 현재 세션에 바로 소스로 저장됩니다.";
  }
  if (surface.id === "repositoryMetadata") {
    return "경로 검증은 소스가 아니므로 프로젝트 기억에 반영되지 않습니다.";
  }
  return "생성된 이벤트는 Import Review에서 수락해야 타임라인에 반영됩니다.";
}

function actionFromSurface(surface: ControlCenterSurface): SourceWorkspaceAction {
  if (surface.action.kind === "evidenceImport" && surface.action.importKind) {
    return {
      kind: "import",
      label: surface.action.label,
      enabled: surface.action.enabled,
      importKind: surface.action.importKind,
      disabledReason: surface.action.disabledReason,
    };
  }
  if (surface.action.kind === "repositorySettings") {
    return {
      kind: "settings",
      label: surface.action.label,
      enabled: surface.action.enabled,
      disabledReason: surface.action.disabledReason,
    };
  }
  return {
    kind: "none",
    label: surface.action.label,
    enabled: false,
  };
}

function pathModeForSurface(surface: ControlCenterSurface): SourceWorkspaceSource["pathMode"] {
  if (surface.id === "repositoryMetadata" || surface.id === "tauriGitDiff") return "requiredPath";
  if (surface.id === "localCaptureBridge" || surface.id === "fileDocumentImport") return "optionalPath";
  if (surface.availability === "planned") return "planned";
  return "notNeeded";
}

function pathLabelForMode(mode: SourceWorkspaceSource["pathMode"]): string {
  switch (mode) {
    case "requiredPath":
      return "사용자 경로 필요";
    case "optionalPath":
      return "선택 파일/경로";
    case "planned":
      return "경로 설정 지원 예정";
    case "notNeeded":
      return "경로 설정 없음";
  }
}

function fromSurface(surface: ControlCenterSurface): SourceWorkspaceSource {
  const status = statusFromAvailability(surface.availability);
  const display = describeControlCenterAvailability(surface.availability);
  const pathMode = pathModeForSurface(surface);
  return {
    id: surface.id,
    name: surface.label,
    category: CATEGORY_BY_SURFACE_ID[surface.id] ?? (surface.toolFamily === "claude" ? "AI" : "Future"),
    familyLabel: FAMILY_LABEL[surface.toolFamily] ?? surface.toolFamily,
    status,
    statusLabel: display.label,
    statusTone: display.tone,
    acquisitionMethod: surface.userActionRequired,
    acceptedFormats: INPUT_FORMATS_BY_SURFACE_ID[surface.id] ?? ["명시 입력 / 지원 형식 확인 필요"],
    setupMethod: surface.setupRequirement,
    pathMode,
    pathStateLabel: pathLabelForMode(pathMode),
    localOnly: surface.privacyBoundary.includes("로컬") || surface.setupRequirement.includes("Tauri") || surface.setupRequirement.includes("connectors/"),
    recommended: surface.recommended,
    privacyNote: surface.privacyBoundary,
    whatMoriCanAccess: surface.whatMoriCanAccess,
    whatMoriCannotAccess: surface.whatMoriNeverAccesses,
    creates: createsForSurface(surface),
    reviewBehavior: reviewBehaviorForSurface(surface),
    rawDataPolicy: surface.rawDataPolicy,
    action: actionFromSurface(surface),
    likelyFiles: LIKELY_FILES_BY_SOURCE_ID[surface.id] ?? ["src/lib/connectors/captureSurfaces.ts"],
    testsNeeded: TESTS_BY_SOURCE_ID[surface.id] ?? ["status copy", "privacy boundary", "action availability"],
    safeToImplementNow: surface.status === "docsTemplateOnly" || surface.status === "implemented" || surface.status === "partial",
  };
}

function connectorJsonlSource(input: BuildControlCenterInput): SourceWorkspaceSource {
  const integration = SOURCE_REGISTRY.connectorJsonl;
  const actionEnabled = input.hasActiveSession;
  return {
    id: "connectorJsonl",
    name: "Connector JSONL",
    category: "Code",
    familyLabel: "로컬 패키지",
    status: "available",
    statusLabel: "사용 가능",
    statusTone: "green",
    acquisitionMethod: "붙여넣기 또는 Tauri inbox에서 사용자가 파일 선택.",
    acceptedFormats: integration.supportedInputTypes,
    setupMethod: "커넥터가 만든 .jsonl 파일 또는 붙여넣은 JSONL. 자동 감시는 없습니다.",
    pathMode: "optionalPath",
    pathStateLabel: "선택 파일/경로",
    localOnly: true,
    recommended: true,
    privacyNote: integration.privacyNote,
    whatMoriCanAccess: ["사용자가 선택한 JSONL 파일", "이벤트 메타데이터", "connectorEventId", "중복 판정 정보"],
    whatMoriCannotAccess: ["inbox 자동 감시", "숨은 폴더 스캔", "계정 / API 키", "실시간 스트림"],
    creates: ["소스 패키지", "정규화된 이벤트", "Import Review 후보", "재import 요약"],
    reviewBehavior: "Connector 이벤트는 Import Review에서 수락해야 타임라인에 반영됩니다. 중복은 기본 제외됩니다.",
    rawDataPolicy: integration.rawDataPolicy,
    action: {
      kind: "import",
      label: "JSONL 불러오기",
      enabled: actionEnabled,
      importKind: "connector",
      disabledReason: actionEnabled ? undefined : "실제 세션을 시작하면 가져올 수 있습니다.",
    },
    likelyFiles: LIKELY_FILES_BY_SOURCE_ID.connectorJsonl ?? [],
    testsNeeded: TESTS_BY_SOURCE_ID.connectorJsonl ?? [],
    safeToImplementNow: true,
  };
}

/**
 * Antigravity is a session-discovery agent: Mori reads the readable
 * `transcript.jsonl` logs the desktop app writes, never the authoritative
 * protobuf store. It has no paste / wrapper way-in, so it is injected here as
 * a single discovery source rather than derived from the connector surfaces.
 * Capture is honestly partial (only conversations with a generated transcript).
 */
function antigravitySource(input: BuildControlCenterInput): SourceWorkspaceSource {
  const status: SourceWorkspaceStatus = input.isDesktop ? "available" : "needsDesktopApp";
  const display = statusLabel(status);
  return {
    id: "antigravityDiscovery",
    name: "Antigravity",
    category: "Code",
    familyLabel: "Antigravity",
    status,
    statusLabel: display.label,
    statusTone: display.tone,
    acquisitionMethod: "데스크톱에서 Antigravity 작업 기록을 감지해 불러옵니다.",
    acceptedFormats: ["Antigravity transcript.jsonl (로컬 작업 기록)"],
    setupMethod: "설정 불필요. 데스크톱 앱이 ~/.gemini/antigravity의 생성된 트랜스크립트만 읽습니다.",
    pathMode: "notNeeded",
    pathStateLabel: "경로 설정 없음",
    localOnly: true,
    recommended: false,
    privacyNote: "로컬 트랜스크립트만 읽습니다. 권위 저장소인 protobuf(.pb)는 읽지 않습니다.",
    whatMoriCanAccess: [
      "트랜스크립트가 생성된 대화 (제목 · 시각)",
      "사용자 · 모델 · 도구 단계 미리보기",
    ],
    whatMoriCannotAccess: [
      "protobuf(.pb) 권위 저장소",
      "계정 · API 접근",
      "백그라운드 감시",
    ],
    creates: ["AI 대화 소스", "타임라인 이벤트 후보", "검토 후보"],
    reviewBehavior:
      "감지한 Antigravity 대화는 세션 생성 후 Import Review를 거쳐 타임라인에 반영됩니다. 트랜스크립트가 있는 세션만 잡히는 부분 캡처입니다.",
    rawDataPolicy: "summaryOnly",
    action: { kind: "none", label: "기록에서 불러오기", enabled: false },
    likelyFiles: ["src-tauri/src/antigravity/sessions.rs", "src/lib/antigravity/"],
    testsNeeded: ["transcript parser", "partial-capture honesty"],
    safeToImplementNow: true,
  };
}

function fromFutureIntegration(integration: SourceIntegration): SourceWorkspaceSource {
  const status = statusFromIntegration(integration.status);
  const display = statusLabel(status);
  return {
    id: integration.id,
    name: integration.label,
    category: CATEGORY_BY_INTEGRATION_ID[integration.id] ?? "Future",
    familyLabel: "지원 예정",
    status,
    statusLabel: display.label,
    statusTone: display.tone,
    acquisitionMethod: "명시 export / 붙여넣기 / 파일 import만 허용 예정.",
    acceptedFormats: integration.supportedInputTypes.length ? integration.supportedInputTypes : ["지원 형식 설계 필요"],
    setupMethod: "아직 연결되지 않았습니다. OAuth, 자동 계정 접근, 백그라운드 수집은 포함하지 않습니다.",
    pathMode: "planned",
    pathStateLabel: "지원 예정",
    localOnly: true,
    recommended: false,
    privacyNote: integration.privacyNote,
    whatMoriCanAccess: ["구현 시 사용자가 명시적으로 내보내거나 붙여넣은 데이터"],
    whatMoriCannotAccess: ["계정 자동 연결", "워크스페이스 전체 미러링", "백그라운드 실시간 수집"],
    creates: outputRecords(integration),
    reviewBehavior: "구현되더라도 검토 후 반영 흐름을 거쳐야 합니다.",
    rawDataPolicy: integration.rawDataPolicy,
    action: { kind: "none", label: "지원 예정", enabled: false },
    likelyFiles: ["src/lib/sources/sourceRegistry.ts", "src/lib/import/"],
    testsNeeded: ["parser / adapter", "privacy boundary", "review-before-apply"],
    safeToImplementNow: false,
  };
}

function fromImportIntegration(
  integration: SourceIntegration,
  input: BuildControlCenterInput,
): SourceWorkspaceSource {
  const status: SourceWorkspaceStatus =
    integration.id === "codexTranscript" ? "available" : statusFromIntegration(integration.status);
  const display = statusLabel(status);
  const actionEnabled = input.hasActiveSession && status === "available";
  const isChatGpt = integration.id === "chatgptTranscript";
  return {
    id: integration.id,
    name: integration.label,
    category: CATEGORY_BY_INTEGRATION_ID[integration.id] ?? "AI",
    familyLabel: isChatGpt ? "ChatGPT" : integration.label.replace(" Transcript", ""),
    status,
    statusLabel: display.label,
    statusTone: display.tone,
    acquisitionMethod: isChatGpt
      ? "ChatGPT export JSON 또는 transcript를 사용자가 붙여넣기."
      : "AI 대화 transcript를 사용자가 붙여넣기.",
    acceptedFormats: isChatGpt
      ? ["ChatGPT conversations.json", "붙여넣은 transcript"]
      : integration.supportedInputTypes,
    setupMethod: "설정 불필요. 계정 연결 없이 사용자가 직접 제공한 텍스트만 처리합니다.",
    pathMode: "notNeeded",
    pathStateLabel: "경로 설정 없음",
    localOnly: true,
    recommended: integration.id === "claudeTranscript" || integration.id === "chatgptTranscript",
    privacyNote: integration.privacyNote,
    whatMoriCanAccess: ["붙여넣은 대화 텍스트", "대화 턴 구조", "코드블록 / 시간 / 역할 메타데이터"],
    whatMoriCannotAccess: ["계정 정보", "API 키", "브라우저 탭", "앱 데이터베이스", "원격 세션 자동 접근"],
    creates: ["AI 대화 소스", "타임라인 이벤트 후보", "근거 후보", "검토 후보"],
    reviewBehavior: "AI 대화 이벤트는 Import Review에서 수락해야 타임라인에 반영됩니다.",
    rawDataPolicy: integration.rawDataPolicy,
    action: {
      kind: "import",
      label: "AI 대화 붙여넣기",
      enabled: actionEnabled,
      importKind: "ai",
      disabledReason: actionEnabled ? undefined : "실제 세션을 시작하면 가져올 수 있습니다.",
    },
    likelyFiles: LIKELY_FILES_BY_SOURCE_ID.aiTranscriptPaste ?? [],
    testsNeeded: TESTS_BY_SOURCE_ID.aiTranscriptPaste ?? [],
    safeToImplementNow: integration.status === "implemented" || integration.id === "codexTranscript",
  };
}

function outputRecords(integration: SourceIntegration): string[] {
  const out: string[] = [];
  if (integration.outputRecords.sources) out.push("소스");
  if (integration.outputRecords.timelineEvents) out.push("타임라인 이벤트");
  if (integration.outputRecords.issues) out.push("검토 후보");
  if (integration.outputRecords.decisions) out.push("결정 후보");
  if (integration.outputRecords.artifacts) out.push("산출물 메타데이터");
  return out.length ? out : ["구현 시 정의"];
}

function sortSources(a: SourceWorkspaceSource, b: SourceWorkspaceSource): number {
  const statusRank: Record<SourceWorkspaceStatus, number> = {
    available: 0,
    needsSetup: 1,
    needsDesktopApp: 2,
    planned: 3,
    unsupported: 4,
  };
  const categoryOrder: SourceWorkspaceCategory[] = [
    "AI",
    "Code",
    "Git",
    "Terminal",
    "Manual",
    "URL",
    "Docs",
    "Design",
    "Issue Tracker",
    "Future",
  ];
  const byStatus = statusRank[a.status] - statusRank[b.status];
  if (byStatus) return byStatus;
  const byCategory = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  if (byCategory) return byCategory;
  return a.name.localeCompare(b.name);
}

export function buildSourceWorkspace(input: BuildControlCenterInput): SourceWorkspaceViewModel {
  const controlCenter = buildConnectorControlCenter(input);
  const surfaceSources = controlCenter.groups.flatMap((group) => group.surfaces.map(fromSurface));
  const knownIds = new Set(surfaceSources.map((source) => source.id));
  const importSources = IMPLEMENTED_IMPORT_INTEGRATION_IDS.flatMap((id) => {
    const integration = SOURCE_REGISTRY[id];
    if (!integration || knownIds.has(id)) return [];
    return [fromImportIntegration(integration, input)];
  });
  const futureSources = FUTURE_INTEGRATION_IDS.flatMap((id) => {
    const integration = SOURCE_REGISTRY[id];
    if (!integration || knownIds.has(id)) return [];
    return [fromFutureIntegration(integration)];
  });
  const sources = [
    connectorJsonlSource(input),
    antigravitySource(input),
    ...importSources,
    ...surfaceSources,
    ...futureSources,
  ].sort(sortSources);
  const counts: SourceWorkspaceCounts = {
    available: sources.filter((source) => source.status === "available").length,
    needsSetup: sources.filter((source) => source.status === "needsSetup" || source.status === "needsDesktopApp").length,
    planned: sources.filter((source) => source.status === "planned").length,
    localOnly: sources.filter((source) => source.localOnly).length,
  };
  return {
    sources,
    counts,
    pipeline: PIPELINE,
    privacySummary: PRIVACY_SUMMARY,
  };
}

export function findSourceWorkspaceSource(
  vm: SourceWorkspaceViewModel,
  id: string,
): SourceWorkspaceSource | null {
  return vm.sources.find((source) => source.id === id) ?? null;
}

export function sourceKindForWorkspaceSource(source: SourceWorkspaceSource): SourceKind | null {
  switch (source.id) {
    case "manualNote":
      return "manualNote";
    case "urlImport":
      return "url";
    case "connectorJsonl":
    case "localCaptureBridge":
    case "claudeCodeHook":
    case "codexCliWrapper":
    case "openCodeCli":
      return "connectorJsonl";
    case "gitDiffPaste":
    case "tauriGitDiff":
    case "githubPrImport":
      return "gitDiff";
    case "aiTranscriptPaste":
      return "aiConversation";
    default:
      return null;
  }
}
