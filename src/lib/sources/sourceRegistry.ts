import type { TrustLevel } from "../../domain/types";

/**
 * Integration status for source types
 */
export type IntegrationStatus =
  | "implemented"    // Fully working with real data
  | "partial"        // Working but limited functionality
  | "planned"        // Designed but not yet implemented
  | "mockOnly"       // Only exists in demo/mock data
  | "unavailable";   // Not available in current runtime (e.g., Tauri-only features in browser)

/**
 * How data is captured from this source
 */
export type CaptureMode =
  | "manual"              // User manually inputs/pastes data
  | "explicitImport"      // User explicitly imports from external source
  | "desktopCommand"      // Tauri desktop command (requires desktop app)
  | "plannedConnector"    // Future connector/extension/plugin
  | "mock";               // Demo/mock data only

/**
 * Privacy policy for raw data handling
 */
export type RawDataPolicy =
  | "retained"      // Full raw data kept locally
  | "summaryOnly"   // Only summary/metadata kept
  | "redacted"      // Sensitive content removed before storage
  | "notCaptured";  // Raw data never captured

/**
 * Types of records this integration can produce
 */
export type OutputRecordTypes = {
  sources: boolean;
  timelineEvents: boolean;
  issues: boolean;
  decisions: boolean;
  relationships: boolean;
  artifacts: boolean;
};

/**
 * Source integration definition
 */
export type SourceIntegration = {
  id: string;
  label: string;
  description: string;
  status: IntegrationStatus;
  trustDefault: TrustLevel;
  rawDataPolicy: RawDataPolicy;
  captureMode: CaptureMode;
  privacyNote: string;
  supportedInputTypes: string[];
  outputRecords: OutputRecordTypes;
};

/**
 * Mori Source Integration Registry
 *
 * Catalogs all current and planned source integrations with their status,
 * trust levels, privacy policies, and capabilities. `description` and
 * `privacyNote` are user-facing Korean copy; `label` keeps the connector's
 * product name.
 */
export const SOURCE_REGISTRY: Record<string, SourceIntegration> = {
  manualNote: {
    id: "manualNote",
    label: "직접 입력 메모",
    description: "사용자가 직접 입력하는 자유 형식 텍스트 메모",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "사용자가 모든 내용을 직접 관리합니다. 자동 캡처나 자동 편집은 없습니다.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  connectorJsonl: {
    id: "connectorJsonl",
    label: "Connector JSONL",
    description:
      "로컬 Claude Code hook · Codex CLI wrapper · 터미널 · Git 커넥터가 남긴 이벤트 로그 (붙여넣기 또는 파일)",
    status: "implemented",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "explicitImport",
    privacyNote:
      "로컬 커넥터 도구가 만든 JSONL 파일을 사용자가 직접 붙여넣거나 선택합니다. 폴더 감시, 터미널 스크래핑, 계정 동기화는 없습니다.",
    supportedInputTypes: ["application/x-ndjson", "application/jsonl", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  url: {
    id: "url",
    label: "URL / 브라우저 페이지",
    description: "웹 페이지 URL과 선택적 텍스트 발췌",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "사용자가 URL과 발췌를 직접 붙여넣습니다. 탭을 자동으로 스캔하지 않습니다.",
    supportedInputTypes: ["text/uri-list", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  aiConversation: {
    id: "aiConversation",
    label: "AI 대화 (기타)",
    description: "다른 AI 어시스턴트의 일반 대화 기록",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "사용자가 어떤 AI 어시스턴트의 대화 텍스트든 직접 붙여넣습니다. 자동 캡처는 없습니다.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  gitDiff: {
    id: "gitDiff",
    label: "Git Diff (붙여넣기)",
    description: "붙여넣은 unified git diff 출력",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "manual",
    privacyNote: "사용자가 git diff 출력을 직접 붙여넣습니다. 파일시스템 스캔은 없습니다.",
    supportedInputTypes: ["text/x-diff", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  tauriGitDiff: {
    id: "tauriGitDiff",
    label: "Git Diff (데스크톱)",
    description: "저장된 리포지토리에 대해 Tauri 데스크톱 명령으로 캡처한 git diff",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "retained",
    captureMode: "desktopCommand",
    privacyNote: "명시적으로 저장한 리포지토리 경로에 대해서만 'git diff'를 실행합니다. 자동 스캔은 없습니다.",
    supportedInputTypes: ["text/x-diff"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  repository: {
    id: "repository",
    label: "리포지토리 설정",
    description: "명시적 Git diff 캡처를 위해 저장한 리포지토리 경로",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "notCaptured",
    captureMode: "desktopCommand",
    privacyNote: "사용자가 추가한 리포지토리 경로만 기억합니다. 디스크를 자동으로 스캔하지 않습니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: false,
      timelineEvents: false,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  quickPass: {
    id: "quickPass",
    label: "Quick Pass 분석",
    description: "가져온 소스에서 이슈 · 결정 · 관계를 추출하는 로컬 분석",
    status: "implemented",
    trustDefault: "inferred",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "가져온 소스를 요청 시점에만 분석합니다. 로컬 휴리스틱 또는 로컬 LLM(Ollama)을 사용합니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: false,
      timelineEvents: false,
      issues: true,
      decisions: true,
      relationships: true,
      artifacts: false,
    },
  },

  terminal: {
    id: "terminal",
    label: "터미널 명령",
    description: "터미널 명령 기록과 출력 요약",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 명시적으로 켜는 터미널 커넥터입니다. 명령마다 사용자 승인을 요구합니다.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  fileSystem: {
    id: "fileSystem",
    label: "파일 시스템 변경",
    description: "로컬 파일 생성 · 수정 · 삭제 이벤트",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 명시적인 프로젝트 폴더 모니터링입니다. 사용자 승인과 개인정보 경계를 요구합니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },

  editor: {
    id: "editor",
    label: "코드 에디터 활동",
    description: "일반 코드 에디터의 파일 열기 · 편집 · 이동",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 에디터에 종속되지 않는 커넥터입니다. 키 입력이 아닌 파일 단위 이벤트만 캡처합니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  vscode: {
    id: "vscode",
    label: "VS Code",
    description: "VS Code 고유의 파일 활동과 확장 이벤트",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: VS Code 확장입니다. VS Code의 개인정보 설정을 따릅니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  cursor: {
    id: "cursor",
    label: "Cursor Editor",
    description: "Cursor 에디터의 AI 대화와 파일 활동",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: Cursor 확장입니다. 사용자 승인하에 AI 상호작용을 캡처합니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  browserTab: {
    id: "browserTab",
    label: "브라우저 탭",
    description: "활성 브라우저 탭 제목과 이동 이벤트",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 브라우저 확장입니다. 사이트별 명시적 승인을 요구하며, 콘텐츠는 캡처하지 않습니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  claudeTranscript: {
    id: "claudeTranscript",
    label: "Claude 대화",
    description: "수동 붙여넣기 또는 Claude Desktop / Claude Code 연결 페이지를 통해 가져온 Claude 대화 기록",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "explicitImport",
    privacyNote: "사용자가 Claude 대화 텍스트를 붙여넣거나, 연결 페이지에서 Claude Desktop SQLite / Claude Code JSONL 파일을 명시적으로 선택해 가져옵니다. 자동 백그라운드 캡처는 없습니다.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  codexTranscript: {
    id: "codexTranscript",
    label: "Codex Transcript",
    description: "GitHub Copilot / Codex 상호작용 기록",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "explicitImport",
    privacyNote: "예정: 명시적인 Codex 기록 가져오기입니다. 사용자가 가져올 세션을 직접 고릅니다.",
    supportedInputTypes: ["application/json", "text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  chatgptTranscript: {
    id: "chatgptTranscript",
    label: "ChatGPT Transcript",
    description: "수동 붙여넣기 또는 내보내기로 가져오는 ChatGPT 대화 기록",
    status: "implemented",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "manual",
    privacyNote: "사용자가 ChatGPT 대화 텍스트를 직접 붙여넣습니다. ChatGPT API 직접 연결은 향후 예정되어 있습니다.",
    supportedInputTypes: ["text/plain"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  docs: {
    id: "docs",
    label: "문서 사이트",
    description: "기술 문서와 레퍼런스 페이지 방문 기록",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 문서 사이트용 브라우저 확장입니다. 콘텐츠가 아닌 페이지 제목만 캡처합니다.",
    supportedInputTypes: [],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  slack: {
    id: "slack",
    label: "Slack 메시지",
    description: "특정 채널에서 가져오는 Slack 대화",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "redacted",
    captureMode: "plannedConnector",
    privacyNote: "예정: 채널별 명시적 승인을 받는 Slack 커넥터입니다. 민감한 콘텐츠는 편집해 제거합니다.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: false,
    },
  },

  figma: {
    id: "figma",
    label: "Figma",
    description: "Figma 파일 접근과 코멘트 가져오기",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 파일별 명시적 승인을 받는 Figma 플러그인입니다. 메타데이터와 코멘트만 캡처합니다.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },

  notion: {
    id: "notion",
    label: "Notion",
    description: "Notion 페이지 편집과 코멘트 가져오기",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "예정: 페이지별 명시적 승인을 받는 Notion 연동입니다. Notion의 개인정보 설정을 따릅니다.",
    supportedInputTypes: ["application/json", "text/markdown"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: false,
      relationships: false,
      artifacts: true,
    },
  },

  linear: {
    id: "linear",
    label: "Linear",
    description: "Planned import for issue updates, comments, status changes, and decisions linked to work items.",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Planned: explicit workspace/project authorization. Mori should keep issue metadata and selected comments, not scrape every workspace discussion.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: true,
      decisions: false,
      relationships: true,
      artifacts: false,
    },
  },

  jira: {
    id: "jira",
    label: "Jira",
    description: "Planned import for ticket updates, comments, status changes, and release/project activity.",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Planned: explicit project-scoped import. Mori should preserve references and selected details, not continuously mirror Jira.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: true,
      decisions: false,
      relationships: true,
      artifacts: false,
    },
  },

  discord: {
    id: "discord",
    label: "Discord",
    description: "Planned import for selected project discussions and decisions.",
    status: "planned",
    trustDefault: "verified",
    rawDataPolicy: "redacted",
    captureMode: "plannedConnector",
    privacyNote: "Planned: explicit channel/message selection only. Private messages and unrelated servers stay outside Mori.",
    supportedInputTypes: ["application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: false,
      decisions: true,
      relationships: true,
      artifacts: false,
    },
  },

  buildLog: {
    id: "buildLog",
    label: "Build / Test Log",
    description: "Planned import for local or CI build, test, and lint output summaries.",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Planned: opt-in log import with redaction. Raw output should be retained only when the user chooses full retention.",
    supportedInputTypes: ["text/plain", "application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: true,
      decisions: false,
      relationships: true,
      artifacts: false,
    },
  },

  deployLog: {
    id: "deployLog",
    label: "Deploy Log",
    description: "Planned import for deployment activity, release markers, and rollout status.",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Planned: explicit environment-scoped import. Secrets, tokens, and environment variables must be redacted before persistence.",
    supportedInputTypes: ["text/plain", "application/json"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: true,
      decisions: false,
      relationships: true,
      artifacts: true,
    },
  },

  automation: {
    id: "automation",
    label: "Automation Agent",
    description: "Planned import for future agent runs, scheduled jobs, and delegated work outputs.",
    status: "planned",
    trustDefault: "observed",
    rawDataPolicy: "summaryOnly",
    captureMode: "plannedConnector",
    privacyNote: "Planned: every automation source must identify its scope, retention policy, and reviewed outputs before entering durable memory.",
    supportedInputTypes: ["application/json", "application/x-ndjson"],
    outputRecords: {
      sources: true,
      timelineEvents: true,
      issues: true,
      decisions: true,
      relationships: true,
      artifacts: true,
    },
  },
};

/**
 * Get integration definition by ID
 */
export function getIntegration(id: string): SourceIntegration | undefined {
  return SOURCE_REGISTRY[id];
}

/**
 * Get all integrations with a specific status
 */
export function getIntegrationsByStatus(status: IntegrationStatus): SourceIntegration[] {
  return Object.values(SOURCE_REGISTRY).filter((integration) => integration.status === status);
}

/**
 * Get all implemented integrations
 */
export function getImplementedIntegrations(): SourceIntegration[] {
  return getIntegrationsByStatus("implemented");
}

/**
 * Get all planned integrations
 */
export function getPlannedIntegrations(): SourceIntegration[] {
  return getIntegrationsByStatus("planned");
}

/**
 * Check if an integration is available in the current runtime
 */
export function isIntegrationAvailable(id: string, isTauri: boolean): boolean {
  const integration = getIntegration(id);
  if (!integration) return false;

  if (integration.status === "unavailable" || integration.status === "mockOnly") {
    return false;
  }

  // Desktop-only integrations require Tauri
  if (integration.captureMode === "desktopCommand" && !isTauri) {
    return false;
  }

  return integration.status === "implemented" || integration.status === "partial";
}
