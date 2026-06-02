import type { FeatureId } from "../../app/featureStatus";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../analysis";
import {
  getIntegrationsByStatus,
  type SourceIntegration,
} from "../sources/sourceRegistry";

/**
 * Pure derivations for the Settings page.
 *
 * Everything user-facing on Settings is rendered from one of these helpers
 * so the React layer never invents status copy and tests can assert the
 * derivation rules directly.
 */

export type RuntimeMode = "browser" | "tauri-desktop";

export type ProviderStatus = "implemented" | "partial" | "planned" | "unavailable";

export type ProviderRow = {
  id: QuickPassProviderKind | "lmStudio" | "openAiCompatible" | "toolNativeApi" | "cloudApi";
  label: string;
  description: string;
  /** UI-facing status: implemented / partial / planned / unavailable. */
  status: ProviderStatus;
  /** Whether the provider runs entirely on the user's machine. */
  isLocal: boolean;
  privacyNote: string;
  receivesData: string;
  setupRequirement: string;
  selected: boolean;
  /** Whether the provider has a real "test connection" path. */
  canTest: boolean;
};

/**
 * Build the rows shown by the Local AI section. The currently-selected
 * Quick Pass provider in `settings` drives the `selected` flag so the UI can
 * highlight without re-computing.
 */
export function getProviderRows(
  settings: QuickPassAnalysisSettings,
): ProviderRow[] {
  const provider: QuickPassProviderKind = settings.provider;
  return [
    {
      id: "deterministic",
      label: "결정론적 Quick Pass",
      description: "결정론적 로컬 휴리스틱 — 네트워크 없음, LLM 없음.",
      status: "implemented",
      isLocal: true,
      privacyNote: "네트워크 호출이 없고 모델도 사용하지 않습니다. 기본 안전 모드입니다.",
      receivesData: "현재 세션의 이벤트 + 소스 (메모리에만 사용)",
      setupRequirement: "설정 불필요",
      selected: provider === "deterministic",
      canTest: false,
    },
    {
      id: "ollama",
      label: "Ollama (로컬 LLM)",
      description: "로컬에서 실행되는 Ollama 인스턴스. 엔드포인트 / 모델 / 타임아웃을 직접 입력합니다.",
      status: "implemented",
      isLocal: true,
      privacyNote:
        "사용자가 입력한 엔드포인트에만 요청을 보냅니다. Mori는 외부 호스트를 자동으로 추가하지 않습니다.",
      receivesData: "현재 세션의 이벤트 + 소스 텍스트 (요약 생성용)",
      setupRequirement: "로컬 Ollama 인스턴스 + 모델",
      selected: provider === "ollama",
      canTest: true,
    },
    {
      id: "lmStudio",
      label: "LM Studio",
      description: "OpenAI 호환 로컬 엔드포인트로 LM Studio를 사용할 계획입니다.",
      status: "planned",
      isLocal: true,
      privacyNote: "구현 시 사용자가 명시적으로 추가한 엔드포인트에만 요청합니다.",
      receivesData: "(구현 시) 현재 세션의 이벤트 + 소스 텍스트",
      setupRequirement: "다음 마일스톤",
      selected: false,
      canTest: false,
    },
    {
      id: "openAiCompatible",
      label: "OpenAI 호환 엔드포인트",
      description: "LM Studio / vLLM / LocalAI / OpenAI API처럼 /v1/chat/completions를 지원하는 엔드포인트.",
      status: "implemented",
      isLocal: false,
      privacyNote: "사용자가 입력한 base URL에만 요청합니다. Cloud URL을 넣으면 외부로 데이터가 전송됩니다.",
      receivesData: "현재 세션의 이벤트 + 소스 텍스트 (요약 생성용)",
      setupRequirement: "OpenAI 호환 base URL + 모델, 필요한 경우 API key",
      selected: provider === "openAiCompatible",
      canTest: true,
    },
    {
      id: "toolNativeApi",
      label: "Claude / Codex / OpenCode 제공자",
      description: "현재는 가져오기 소스입니다. Quick Pass 제공자로 직접 연결하는 기능은 없습니다.",
      status: "planned",
      isLocal: false,
      privacyNote: "구현 전까지 Mori는 해당 도구 계정이나 API에 연결하지 않습니다.",
      receivesData: "(구현 시) 사용자가 명시적으로 선택한 세션 데이터",
      setupRequirement: "계정 / API 경계 설계 후",
      selected: false,
      canTest: false,
    },
    {
      id: "cloudApi",
      label: "Cloud API (명시적 동의 필요)",
      description: "Anthropic / OpenAI 등 외부 API. 명시적 opt-in 후에만 사용됩니다.",
      status: "planned",
      isLocal: false,
      privacyNote: "기본은 차단. 사용자가 직접 활성화하기 전까지 어떤 외부 API에도 데이터를 보내지 않습니다.",
      receivesData: "(구현 시) opt-in 시 명시적으로 선택한 데이터",
      setupRequirement: "Mori는 현재 cloud API 키를 저장하지 않습니다.",
      selected: false,
      canTest: false,
    },
  ];
}

export type PrivacyPolicyRow = {
  id: string;
  label: string;
  detail: string;
  /** "enforced" → the app guarantees this today. "default" → ships on by default in current session settings.
   *  "planned" → the controlled behavior is not yet wired. */
  state: "enforced" | "default" | "planned";
};

/**
 * Privacy section is intentionally **read-only status cards**, not toggles.
 * Several of these guarantees are baked into the app's design (no background
 * capture, no browser scanning) and are not user-controllable.
 */
export function getPrivacyPolicy(): PrivacyPolicyRow[] {
  return [
    {
      id: "no-background-capture",
      label: "백그라운드 캡처 없음",
      detail: "Mori는 화면, 앱, 브라우저, 클립보드 내용을 백그라운드에서 수집하지 않습니다.",
      state: "enforced",
    },
    {
      id: "no-browser-scan",
      label: "브라우저 / 앱 스캔 없음",
      detail: "브라우저 탭, 앱 창, 채팅 도구를 자동으로 읽지 않습니다. URL과 가져오기는 사용자가 제공합니다.",
      state: "enforced",
    },
    {
      id: "no-fs-scan",
      label: "디스크 스캔 없음",
      detail: "사용자가 추가한 리포지토리 경로만 저장하고, 검증 또는 Git diff 캡처 때만 읽습니다.",
      state: "enforced",
    },
    {
      id: "no-oauth",
      label: "자동 계정 연결 없음",
      detail: "Claude, ChatGPT, Codex, 향후 integration은 자동으로 연결되거나 로그인되지 않습니다.",
      state: "enforced",
    },
    {
      id: "ai-transcript-summary-only",
      label: "가져온 transcript 최소화",
      detail: "AI transcript는 검토에 필요한 이벤트, 소스 메타데이터, 요약 형태로 정규화됩니다.",
      state: "default",
    },
    {
      id: "client-safe-report-mode",
      label: "Client-safe 보고서",
      detail: "보고서에서 켜면 원문, 소스 세부 정보, 파일 경로를 내보내기에서 제외합니다.",
      state: "default",
    },
    {
      id: "robust-redaction",
      label: "자동 PII redaction",
      detail: "보고서 내보내기용 자동 마스킹은 예정입니다. 현재는 섹션 단위 내보내기 제어를 제공합니다.",
      state: "planned",
    },
  ];
}

/** Privacy policy rows grouped by state, for the Privacy & Data Control surface. */
export type GroupedPrivacyPolicy = {
  enforced: PrivacyPolicyRow[];
  default: PrivacyPolicyRow[];
  planned: PrivacyPolicyRow[];
};

/**
 * Group privacy policy rows by state so the surface can separate
 * architecture-guaranteed behaviour from default-on settings and
 * not-yet-built controls.
 */
export function groupPrivacyPolicyByState(
  rows: PrivacyPolicyRow[] = getPrivacyPolicy(),
): GroupedPrivacyPolicy {
  return {
    enforced: rows.filter((row) => row.state === "enforced"),
    default: rows.filter((row) => row.state === "default"),
    planned: rows.filter((row) => row.state === "planned"),
  };
}

/**
 * The hard "what Mori never does" guarantees — the explicit non-goals
 * from `docs/mori-project-goal.md` §6 / §14. These are never user
 * settings; they are properties of the app's design. One source of
 * truth for the Privacy surface and the Trust summary rail.
 */
export function getPrivacyGuarantees(): string[] {
  return [
    "백그라운드 화면 캡처 또는 자동 화면 기록",
    "브라우저 탭이나 다른 앱 창 읽기",
    "사용자가 추가하지 않은 폴더 스캔",
    "OAuth 또는 자동 계정 연결",
    "키 입력 기록, 클립보드 가로채기, 상시 데몬",
    "자동 업로드 또는 클라우드 동기화",
    "검토 없는 프로젝트 메모리 저장",
  ];
}

export type StorageStatusKind = "browser-draft" | "desktop-sqlite";

export type StorageStatusRow = {
  id: string;
  label: string;
  description: string;
  state: "active" | "available" | "unavailable" | "planned";
  hint: string;
  badgeTone: "green" | "blue" | "purple" | "gray" | "orange";
};

export function getStorageStatusRows({
  mode,
  sqliteAvailable,
  sqliteKind,
  sqliteSessionCount,
  packageDraftCount,
}: {
  mode: RuntimeMode;
  sqliteAvailable: boolean;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
  packageDraftCount: number;
}): StorageStatusRow[] {
  return [
    {
      id: "browser-draft",
      label: "브라우저 draft (localStorage)",
      description: "활성 세션, 가져온 소스, 분석 결과, 리포지토리 목록을 브라우저에 임시 보관합니다.",
      state: "active",
      hint: "데스크톱 모드에서는 SQLite가 source of truth이지만, browser draft는 fallback으로 계속 사용됩니다.",
      badgeTone: "blue",
    },
    {
      id: "desktop-sqlite",
      label: "Desktop SQLite",
      description: "Tauri 데스크톱 앱에서 활성화되는 로컬 SQLite 저장소.",
      state:
        mode === "browser"
          ? "unavailable"
          : sqliteAvailable
            ? sqliteKind === "ok"
              ? "active"
              : sqliteKind === "checking"
                ? "available"
                : "unavailable"
            : "unavailable",
      hint:
        mode === "browser"
          ? "브라우저 prototype 모드에서는 비활성화됩니다. Tauri 앱에서 자동으로 활성화됩니다."
          : sqliteKind === "ok"
            ? `저장된 세션 ${sqliteSessionCount}건`
            : "마이그레이션 적용 후 사용 가능합니다.",
      badgeTone: mode === "tauri-desktop" && sqliteKind === "ok" ? "green" : "gray",
    },
    {
      id: "mori-package",
      label: ".mori v0 패키지 (JSON)",
      description: "세션 전체를 직렬화해 로컬로 내보내는 JSON 패키지.",
      state: packageDraftCount > 0 ? "active" : "available",
      hint:
        packageDraftCount > 0
          ? `브라우저 드래프트에 ${packageDraftCount}건의 패키지가 있습니다.`
          : "공유 화면의 \".mori v0 JSON 내보내기\" 버튼으로 생성합니다.",
      badgeTone: packageDraftCount > 0 ? "purple" : "gray",
    },
    {
      id: "markdown-report",
      label: "Markdown 보고서",
      description: "공유 화면에서 Markdown으로 복사 / .md로 다운로드합니다.",
      state: "active",
      hint: "PDF / HTML 내보내기는 다음 마일스톤입니다.",
      badgeTone: "green",
    },
    {
      id: "zip-mori",
      label: ".mori 패키지 (zip-like)",
      description: "Markdown / 첨부 / 자산을 묶는 zip 형식 패키지.",
      state: "planned",
      hint: "현재는 JSON 패키지만 지원합니다.",
      badgeTone: "gray",
    },
  ];
}

export type ConnectorRow = {
  integration: SourceIntegration;
  /** What Mori would access once implemented. */
  willAccess: string[];
  willNotAccess: string[];
};

export function getPlannedConnectorRows(): ConnectorRow[] {
  const planned = getIntegrationsByStatus("planned");
  return planned.map((integration) => ({
    integration,
    willAccess: derivePlannedAccess(integration),
    willNotAccess: [
      "백그라운드 자동 캡처",
      "사용자 동의 없는 데이터 수집",
      "Mori 외부 호스트로의 자동 전송",
    ],
  }));
}

/**
 * Bridge from a legacy `sourceRegistry` integration id to the canonical
 * `featureStatus.ts` feature id. Integrations that have a real feature
 * row resolve their Planned-action copy from the registry; ones that do
 * not yet have a counterpart (slack / notion / figma / docs) return
 * `null` so the caller falls back to a generic Planned action rather
 * than fabricating a registry row.
 */
const CONNECTOR_FEATURE_ID: Record<string, FeatureId> = {
  terminal: "connector.terminalShellIntegration",
  fileSystem: "connector.fileDocumentImport",
  editor: "connector.vscodeExtension",
  vscode: "connector.vscodeExtension",
  cursor: "connector.cursorExtension",
  browserTab: "connector.browserExtension",
  codexTranscript: "connector.codexDesktopImport",
};

export function getConnectorFeatureId(integrationId: string): FeatureId | null {
  return CONNECTOR_FEATURE_ID[integrationId] ?? null;
}

function derivePlannedAccess(integration: SourceIntegration): string[] {
  const out: string[] = [];
  if (integration.captureMode === "plannedConnector") {
    out.push("사용자가 활성화한 connector에서 명시적으로 가져온 이벤트");
  } else if (integration.captureMode === "explicitImport") {
    out.push("사용자가 직접 import한 데이터");
  }
  if (integration.outputRecords.sources) out.push("정규화된 SourceRef");
  if (integration.outputRecords.timelineEvents) out.push("정규화된 Timeline Event");
  if (integration.outputRecords.artifacts) out.push("연결된 산출물 메타데이터");
  return out;
}

export type RepositorySummary = {
  total: number;
  verified: number;
  stale: number;
  failed: number;
  unverified: number;
  default: string | null;
};

export function summarizeRepositories(repositories: Array<{
  id: string;
  isDefault?: boolean;
  verification?: {
    status: "unverified" | "verified" | "failed";
    verifiedAt?: string;
  };
}>): RepositorySummary {
  const summary: RepositorySummary = {
    total: repositories.length,
    verified: 0,
    stale: 0,
    failed: 0,
    unverified: 0,
    default: null,
  };
  const STALE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const repo of repositories) {
    if (repo.isDefault) summary.default = repo.id;
    const status = repo.verification?.status ?? "unverified";
    if (status === "failed") summary.failed += 1;
    else if (status === "verified") {
      const verifiedAt = repo.verification?.verifiedAt;
      const stale = verifiedAt ? now - new Date(verifiedAt).getTime() > STALE_MS : false;
      if (stale) summary.stale += 1;
      else summary.verified += 1;
    } else {
      summary.unverified += 1;
    }
  }
  return summary;
}

export type RecommendedSetupStep =
  | { id: "import-source"; label: string }
  | { id: "run-quickpass"; label: string }
  | { id: "verify-repository"; label: string }
  | { id: "save-to-sqlite"; label: string }
  | { id: "configure-ollama"; label: string }
  | { id: "all-good"; label: string };

/**
 * Recommend the single next setup step a user should take. Order is the
 * same as the product flow: get evidence in, analyse, verify storage,
 * upgrade local AI.
 */
export function getRecommendedSetupStep({
  importsCount,
  hasAnalysis,
  repositoriesTotal,
  mode,
  sqliteKind,
  hasUnsavedDraft,
  providerKind,
}: {
  importsCount: number;
  hasAnalysis: boolean;
  repositoriesTotal: number;
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  hasUnsavedDraft: boolean;
  providerKind: QuickPassProviderKind;
}): RecommendedSetupStep {
  if (importsCount === 0) {
    return { id: "import-source", label: "세션의 자료 탭에서 가져오기를 시작하세요." };
  }
  if (!hasAnalysis) {
    return { id: "run-quickpass", label: "검토 또는 보고서에서 Quick Pass를 실행하세요." };
  }
  if (mode === "tauri-desktop" && sqliteKind === "ok" && hasUnsavedDraft) {
    return { id: "save-to-sqlite", label: "현재 세션을 SQLite에 저장하면 Project Memory가 영속됩니다." };
  }
  if (repositoriesTotal === 0) {
    return { id: "verify-repository", label: "Repositories에서 작업 중인 리포지토리를 추가하세요." };
  }
  if (providerKind === "deterministic") {
    return {
      id: "configure-ollama",
      label: "더 풍부한 분석을 원하면 Ollama 또는 OpenAI 호환 제공자를 설정하세요.",
    };
  }
  return { id: "all-good", label: "설정이 모두 완료되었습니다. 다음 세션을 시작하세요." };
}
