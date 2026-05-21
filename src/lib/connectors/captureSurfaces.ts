import type { TrustLevel } from "../../domain/types";

/**
 * Capture Surface Matrix.
 *
 * A capture surface is *one way* a user can move evidence into Mori. The
 * point of this module is to be honest about every surface — implemented,
 * partial, docs-only, planned, or unavailable — instead of treating
 * "Claude" or "Codex" as a single product feature.
 *
 * Every visible status copy on the Settings / Evidence Hub / Connector
 * Setup screens should be derived from this list so the UI cannot
 * accidentally over-promise.
 */

export type CaptureSurfaceId =
  | "manualNote"
  | "urlImport"
  | "aiTranscriptPaste"
  | "gitDiffPaste"
  | "tauriGitDiff"
  | "repositoryMetadata"
  | "quickPass"
  | "localCaptureBridge"
  | "claudeCodeHook"
  | "claudeDesktopExport"
  | "claudeWebExport"
  | "codexCliWrapper"
  | "codexDesktopExport"
  | "codexWebGithub"
  | "vscodeExtension"
  | "cursorExtension"
  | "terminalShellIntegration"
  | "browserExtension"
  | "githubPrImport"
  | "fileDocumentImport"
  | "mcpServer";

export type CaptureSurfaceToolFamily =
  | "manual"
  | "claude"
  | "codex"
  | "git"
  | "ide"
  | "browser"
  | "terminal"
  | "document"
  | "analysis";

export type CaptureSurfaceSurface =
  | "paste"
  | "cli"
  | "desktop"
  | "web"
  | "ide"
  | "git"
  | "localFile"
  | "localCommand"
  | "extension"
  | "analysis";

export type CaptureSurfaceStatus =
  | "implemented"
  | "partial"
  | "manualOnly"
  | "docsTemplateOnly"
  | "planned"
  | "unavailable";

export type CaptureSurfaceCaptureMode =
  | "explicitPaste"
  | "explicitFileImport"
  | "localHook"
  | "localCliWrapper"
  | "localDesktopCommand"
  | "plannedExtension"
  | "plannedApi"
  | "plannedMcp"
  | "manualAnalysis";

export type CaptureSurfaceRawDataPolicy =
  | "retained"
  | "summaryOnly"
  | "redacted"
  | "notCaptured"
  | "referenceOnly";

export type CaptureSurfaceRow = {
  id: CaptureSurfaceId;
  label: string;
  toolFamily: CaptureSurfaceToolFamily;
  surface: CaptureSurfaceSurface;
  status: CaptureSurfaceStatus;
  captureMode: CaptureSurfaceCaptureMode;
  /** Plain-language description of the click / paste / install the user must do. */
  userActionRequired: string;
  canCreateSource: boolean;
  canCreateEvents: boolean;
  canEnterImportReview: boolean;
  rawDataPolicy: CaptureSurfaceRawDataPolicy;
  trustDefault: TrustLevel;
  /** Single-line privacy guarantee shown in the UI. */
  privacyBoundary: string;
  /** Bulleted list of what Mori *can* see today / once enabled. */
  whatMoriCanAccess: string[];
  /** Bulleted list of what Mori will never read silently. */
  whatMoriNeverAccesses: string[];
  /** What the user needs to install / configure / paste. */
  setupRequirement: string;
  /** The single concrete next step that would move this surface forward. */
  nextStep: string;
  /** Existing `SourceIntegration` ids in `sourceRegistry.ts` this surface
   *  maps to. Empty when the surface has no registry counterpart yet. */
  relatedIntegrationIds: string[];
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * IMPORTANT: every status / capture mode / privacy claim in this table must
 * be true today. Changes here are status changes — bump them deliberately
 * when an actual capability lands. Tests assert that fake-active rows do
 * not slip in (e.g. no planned surface gets `canEnterImportReview: true`).
 */
const CAPTURE_SURFACES: CaptureSurfaceRow[] = [
  {
    id: "manualNote",
    label: "직접 입력 메모",
    toolFamily: "manual",
    surface: "paste",
    status: "implemented",
    captureMode: "explicitPaste",
    userActionRequired: "Evidence Hub → 메모 탭에 직접 작성하고 저장.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: false,
    rawDataPolicy: "retained",
    trustDefault: "verified",
    privacyBoundary: "사용자가 직접 작성한 텍스트만 저장합니다. 다른 데이터 출처는 없습니다.",
    whatMoriCanAccess: ["사용자가 입력한 메모 본문"],
    whatMoriNeverAccesses: ["다른 앱", "디스크", "브라우저 탭", "네트워크"],
    setupRequirement: "설정 불필요.",
    nextStep: "유지 — 가장 안전한 기본 경로.",
    relatedIntegrationIds: ["manualNote"],
  },
  {
    id: "urlImport",
    label: "URL / web page excerpt",
    toolFamily: "manual",
    surface: "paste",
    status: "implemented",
    captureMode: "explicitPaste",
    userActionRequired: "Evidence Hub → URL 탭에 URL과 발췌를 직접 붙여넣기.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: false,
    rawDataPolicy: "retained",
    trustDefault: "verified",
    privacyBoundary: "사용자가 직접 붙여넣은 URL과 텍스트만 저장합니다.",
    whatMoriCanAccess: ["사용자가 입력한 URL", "사용자가 붙여넣은 발췌 텍스트"],
    whatMoriNeverAccesses: ["브라우저 탭", "쿠키", "히스토리", "원격 페이지 자동 fetch"],
    setupRequirement: "설정 불필요.",
    nextStep: "유지 — manual paste 기본 경로.",
    relatedIntegrationIds: ["url"],
  },
  {
    id: "aiTranscriptPaste",
    label: "AI transcript paste (Claude / ChatGPT / Codex / Other)",
    toolFamily: "claude",
    surface: "paste",
    status: "implemented",
    captureMode: "explicitPaste",
    userActionRequired: "Evidence Hub → AI 대화 탭에서 플랫폼을 고르고 transcript를 붙여넣기.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "사용자가 직접 복사해서 붙여넣은 텍스트만 저장합니다. 계정 연결은 없습니다.",
    whatMoriCanAccess: ["붙여넣은 대화 텍스트", "추출한 턴 수 / 코드블록 수 / 토큰 추정"],
    whatMoriNeverAccesses: ["Anthropic / OpenAI 계정", "API 키", "브라우저 / 데스크톱 앱 창"],
    setupRequirement: "설정 불필요.",
    nextStep: "추가 작업 없음 — Evidence Hub의 Connector JSONL Import 탭이 hook/wrapper 결과도 같은 흐름으로 합류시킴.",
    relatedIntegrationIds: ["claudeTranscript", "chatgptTranscript", "codexTranscript", "aiConversation"],
  },
  {
    id: "gitDiffPaste",
    label: "Git diff 붙여넣기",
    toolFamily: "git",
    surface: "paste",
    status: "implemented",
    captureMode: "explicitPaste",
    userActionRequired: "Evidence Hub → Git diff 탭에 unified diff 텍스트를 붙여넣기.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "retained",
    trustDefault: "verified",
    privacyBoundary: "사용자가 직접 붙여넣은 diff 텍스트만 저장합니다.",
    whatMoriCanAccess: ["붙여넣은 unified diff", "파일 단위 추가/삭제 통계"],
    whatMoriNeverAccesses: ["다른 파일", "다른 브랜치", "git 히스토리"],
    setupRequirement: "설정 불필요.",
    nextStep: "유지 — Tauri Git diff capture와 같은 normalizer를 공유.",
    relatedIntegrationIds: ["gitDiff"],
  },
  {
    id: "tauriGitDiff",
    label: "Tauri Git diff 캡처",
    toolFamily: "git",
    surface: "localCommand",
    status: "implemented",
    captureMode: "localDesktopCommand",
    userActionRequired: "Tauri 앱에서 \"Fetch Git Diff\" 버튼을 직접 클릭. 저장된 repo 경로 + range가 필요합니다.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "retained",
    trustDefault: "verified",
    privacyBoundary: "사용자가 명시적으로 추가한 repo 경로에 대해서만, 사용자가 fetch 버튼을 누른 순간에만 git diff 실행.",
    whatMoriCanAccess: ["선택한 repo의 git diff 출력 (사용자 입력 range)"],
    whatMoriNeverAccesses: ["다른 디스크 위치", "background scan", "git history 자동 fetch"],
    setupRequirement: "Settings → Repositories에서 경로를 직접 추가.",
    nextStep: "git diff range UI에 commit picker / branch picker를 추가하면 더 정확한 캡처 가능.",
    relatedIntegrationIds: ["tauriGitDiff", "gitDiff"],
  },
  {
    id: "repositoryMetadata",
    label: "리포지토리 메타데이터 (Verify)",
    toolFamily: "git",
    surface: "localCommand",
    status: "implemented",
    captureMode: "localDesktopCommand",
    userActionRequired: "Settings → Repositories에서 Verify 버튼을 직접 클릭.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "notCaptured",
    trustDefault: "verified",
    privacyBoundary: "branch / HEAD / dirty 상태만 기록합니다. 파일은 읽지 않습니다.",
    whatMoriCanAccess: ["git rev-parse / branch --show-current / status --porcelain 결과"],
    whatMoriNeverAccesses: ["파일 내용", "히스토리", "다른 repo"],
    setupRequirement: "Tauri 앱 필요. 경로를 직접 추가해야 동작.",
    nextStep: "Verify freshness를 다른 화면(Project Memory)에서도 활용.",
    relatedIntegrationIds: ["repository"],
  },
  {
    id: "quickPass",
    label: "Quick Pass 분석",
    toolFamily: "analysis",
    surface: "analysis",
    status: "implemented",
    captureMode: "manualAnalysis",
    userActionRequired: "Review 또는 Reports에서 \"Run Quick Pass\" 버튼을 직접 클릭.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "inferred",
    privacyBoundary: "이미 import된 세션 데이터만 분석. 추가 데이터는 가져오지 않습니다.",
    whatMoriCanAccess: ["현재 세션의 이벤트 + 소스 텍스트 (deterministic 또는 사용자 설정 Ollama endpoint)"],
    whatMoriNeverAccesses: ["외부 API (cloud opt-in 없을 때)", "다른 세션", "다른 프로젝트"],
    setupRequirement: "deterministic은 즉시 사용 가능. Ollama 등 로컬 LLM은 Settings에서 endpoint를 직접 입력.",
    nextStep: "LM Studio / OpenAI-compatible local endpoint 지원 추가.",
    relatedIntegrationIds: ["quickPass"],
  },
  // ---- Local capture bridge ----
  {
    id: "localCaptureBridge",
    label: "로컬 캡처 CLI 브릿지 (mori-local-capture)",
    toolFamily: "terminal",
    surface: "localCommand",
    status: "docsTemplateOnly",
    captureMode: "localCliWrapper",
    userActionRequired:
      "사용자가 mori-local-capture.py를 직접 실행 (--transcript / --note / --git-repo / --git-commit), 또는 mori-capture 셸 함수 / VS Code 태스크로 호출.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary:
      "사용자가 명시적으로 지정한 transcript 파일 / 노트 / git 저장소만 읽어 summary-only 이벤트를 ~/.mori/connectors/에 기록합니다. watcher 없음.",
    whatMoriCanAccess: [
      "사용자가 지정한 transcript 파일 / stdin의 summary",
      "사용자가 입력한 노트",
      "사용자가 지정한 repo의 git 메타데이터 (branch / SHA / 변경 파일 / diffstat)",
    ],
    whatMoriNeverAccesses: [
      "raw transcript 본문",
      "git diff / 파일 내용",
      "셸 히스토리 자동 스캔",
      "백그라운드 watcher / 데몬",
      "계정 / API 키",
    ],
    setupRequirement:
      "connectors/local-capture/ 의 mori-local-capture.py 실행 (Python 3.8+). 선택적으로 connectors/terminal-helper/ 셸 함수 또는 connectors/vscode-task/ 태스크 템플릿.",
    nextStep:
      "캡처 결과는 Evidence Hub의 Connector JSONL import로 검토됩니다; 더 깊은 IDE 통합은 별도 Track.",
    relatedIntegrationIds: ["aiConversation", "gitDiff", "manualNote"],
  },
  // ---- Claude family ----
  {
    id: "claudeCodeHook",
    label: "Claude Code 훅 (로컬 JSONL)",
    toolFamily: "claude",
    surface: "cli",
    status: "docsTemplateOnly",
    captureMode: "localHook",
    userActionRequired: "사용자가 Claude Code 설정에 hook 스크립트를 직접 등록.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "스크립트가 로컬 JSONL 파일을 작성합니다. Mori는 사용자가 파일을 가져오라고 클릭한 순간에만 읽습니다.",
    whatMoriCanAccess: ["사용자가 등록한 hook 이벤트의 summary", "tool 호출 메타데이터", "session start/finish 시각"],
    whatMoriNeverAccesses: ["Claude 계정", "Anthropic API 키", "다른 앱 / 브라우저", "raw transcript 본문 (기본은 summary_only)"],
    setupRequirement: "connectors/claude-code/ 템플릿을 사용자가 PATH에 설치.",
    nextStep: "Connector JSONL Import 탭으로 이미 합류 가능; 다음 단계는 hook 설치를 돕는 in-app 가이드.",
    relatedIntegrationIds: ["claudeTranscript"],
  },
  {
    id: "claudeDesktopExport",
    label: "Claude Desktop 내보내기",
    toolFamily: "claude",
    surface: "desktop",
    status: "planned",
    captureMode: "explicitFileImport",
    userActionRequired: "사용자가 Claude Desktop에서 transcript를 export → Mori에서 파일을 직접 선택.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "사용자가 export한 파일만 읽습니다. 데스크톱 앱 창을 자동으로 읽지 않습니다.",
    whatMoriCanAccess: ["사용자가 명시적으로 import한 파일 내용"],
    whatMoriNeverAccesses: ["Claude Desktop 창 / 메모리 / 자동 스캔", "Anthropic 계정"],
    setupRequirement: "Anthropic이 export 포맷을 제공해야 함 (현재 transcript paste로 대체).",
    nextStep: "Anthropic export 포맷이 등장하면 file-import normalizer 추가.",
    relatedIntegrationIds: ["claudeTranscript"],
  },
  {
    id: "claudeWebExport",
    label: "Claude Web 내보내기",
    toolFamily: "claude",
    surface: "web",
    status: "planned",
    captureMode: "explicitFileImport",
    userActionRequired: "Claude Web에서 사용자가 transcript를 export하거나 직접 copy → paste.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "Claude 웹 화면을 자동으로 읽는 capture는 절대 추가하지 않습니다.",
    whatMoriCanAccess: ["사용자가 직접 붙여넣은 / 다운로드한 transcript"],
    whatMoriNeverAccesses: ["claude.ai 세션 쿠키", "OAuth", "탭 자동 읽기", "browser auto-scraping"],
    setupRequirement: "현재는 transcript paste 사용.",
    nextStep: "Anthropic이 안정적 export를 제공하면 importer 추가. browser extension은 명시적으로 Planned.",
    relatedIntegrationIds: ["claudeTranscript"],
  },
  // ---- Codex family ----
  {
    id: "codexCliWrapper",
    label: "Codex CLI 래퍼 (로컬 JSONL)",
    toolFamily: "codex",
    surface: "cli",
    status: "docsTemplateOnly",
    captureMode: "localCliWrapper",
    userActionRequired: "사용자가 PATH에 wrapper를 설치하고 `mori-codex-wrapper.sh -- codex run ...` 형태로 직접 실행.",
    canCreateSource: true,
    canCreateEvents: true,
    canEnterImportReview: true,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "wrapper는 prompt summary / exit code / duration / --git 옵션 시 shortstat만 기록합니다. Codex 출력 본문은 수집하지 않습니다.",
    whatMoriCanAccess: ["session_started / command_finished 메타데이터", "(옵션) git diff --shortstat 한 줄"],
    whatMoriNeverAccesses: ["Codex 계정", "API 키", "환경 변수", "git diff 본문", "stdout/stderr 전체"],
    setupRequirement: "connectors/codex-cli/ 템플릿을 PATH에 설치.",
    nextStep: "Connector JSONL Import 탭으로 이미 합류 가능; 다음 단계는 wrapper 설치를 돕는 in-app 가이드.",
    relatedIntegrationIds: ["codexTranscript"],
  },
  {
    id: "codexDesktopExport",
    label: "Codex Desktop 내보내기",
    toolFamily: "codex",
    surface: "desktop",
    status: "planned",
    captureMode: "explicitFileImport",
    userActionRequired: "사용자가 Codex desktop에서 export하거나 transcript를 직접 paste.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "Codex desktop 창의 자동 capture는 추가하지 않습니다.",
    whatMoriCanAccess: ["사용자가 직접 import한 export 파일 또는 paste 본문"],
    whatMoriNeverAccesses: ["Codex 계정", "API 키", "데스크톱 자동 스크래핑"],
    setupRequirement: "현재는 transcript paste 사용.",
    nextStep: "OpenAI가 안정적 export 포맷을 제공하면 importer 추가.",
    relatedIntegrationIds: ["codexTranscript"],
  },
  {
    id: "codexWebGithub",
    label: "Codex Web · GitHub 워크플로",
    toolFamily: "codex",
    surface: "web",
    status: "planned",
    captureMode: "explicitFileImport",
    userActionRequired: "사용자가 GitHub PR / cloud job 결과를 직접 share 또는 export.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "Mori는 GitHub OAuth 없이는 PR을 읽지 않습니다. 사용자가 명시적으로 paste / file import해야 합니다.",
    whatMoriCanAccess: ["사용자가 직접 입력한 PR URL + paste한 본문 / diff"],
    whatMoriNeverAccesses: ["GitHub OAuth 자동 연결", "Codex cloud 세션 / API"],
    setupRequirement: "현재는 paste 또는 git diff 활용.",
    nextStep: "github-pr-import.md에 따라 사용자가 URL을 입력하면 paste + diff를 결합하는 importer 설계.",
    relatedIntegrationIds: ["codexTranscript"],
  },
  // ---- IDE / shell / browser families (planned) ----
  {
    id: "vscodeExtension",
    label: "VS Code extension",
    toolFamily: "ide",
    surface: "extension",
    status: "planned",
    captureMode: "plannedExtension",
    userActionRequired: "(미구현) VS Code 확장을 사용자가 직접 설치하고 권한을 명시적으로 부여.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "구현 시 파일 단위 이벤트만 캡처. 키 입력은 캡처하지 않음.",
    whatMoriCanAccess: ["(구현 시) 사용자가 열어둔 워크스페이스의 파일 open / save / test run 이벤트 메타데이터"],
    whatMoriNeverAccesses: ["키 입력", "터미널 출력 전체", "VS Code 계정"],
    setupRequirement:
      "확장 미구현. 명시적 캡처는 connectors/vscode-task/ 태스크 템플릿(localCaptureBridge 호출)으로 오늘 가능.",
    nextStep: "extension manifest 설계 + 권한 모델 정의.",
    relatedIntegrationIds: ["vscode", "editor"],
  },
  {
    id: "cursorExtension",
    label: "Cursor 확장",
    toolFamily: "ide",
    surface: "extension",
    status: "planned",
    captureMode: "plannedExtension",
    userActionRequired: "(미구현) Cursor 확장 설치 + 권한 부여.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "구현 시 AI interaction 이벤트만 user 승인 후 캡처.",
    whatMoriCanAccess: ["(구현 시) 사용자 승인된 AI 호출 / 파일 변경 메타데이터"],
    whatMoriNeverAccesses: ["Cursor 계정", "API 키", "다른 프로젝트"],
    setupRequirement: "확장 미구현.",
    nextStep: "VS Code 확장 이후 동일한 패턴으로 진행.",
    relatedIntegrationIds: ["cursor"],
  },
  {
    id: "terminalShellIntegration",
    label: "터미널 셸 통합",
    toolFamily: "terminal",
    surface: "cli",
    status: "planned",
    captureMode: "plannedExtension",
    userActionRequired: "(미구현) 사용자가 직접 zsh/bash/fish 훅을 등록.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "구현 시 명령 / exit code / 작업 디렉터리만 기록. stdout/stderr 본문은 기록하지 않음.",
    whatMoriCanAccess: ["(구현 시) 사용자가 hook으로 등록한 명령의 메타데이터"],
    whatMoriNeverAccesses: ["bash_history 자동 스캔", "환경 변수 dump", "다른 셸 세션"],
    setupRequirement:
      "shell hook 미구현. 명시적 캡처는 connectors/terminal-helper/ 의 mori-capture 셸 함수(localCaptureBridge 호출)로 오늘 가능.",
    nextStep: "zsh / bash / fish preexec/precmd 후크 템플릿 정의.",
    relatedIntegrationIds: ["terminal"],
  },
  {
    id: "browserExtension",
    label: "브라우저 확장",
    toolFamily: "browser",
    surface: "extension",
    status: "planned",
    captureMode: "plannedExtension",
    userActionRequired: "(미구현) 사용자가 브라우저 확장을 직접 설치 + 사이트 권한 부여.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "구현 시 명시적으로 등록한 사이트만 캡처. 자동 탭 스캔은 절대 없음.",
    whatMoriCanAccess: ["(구현 시) 사용자가 \"이 페이지를 Mori에 추가\"를 클릭한 페이지 메타데이터"],
    whatMoriNeverAccesses: ["탭 목록 자동 읽기", "히스토리", "쿠키", "OAuth"],
    setupRequirement: "확장 미구현. 페이지 추가는 현재 URL paste로 대체.",
    nextStep: "Manifest v3 확장 설계 + URL paste API 보완.",
    relatedIntegrationIds: ["browserTab"],
  },
  {
    id: "githubPrImport",
    label: "GitHub PR / 커밋 import",
    toolFamily: "git",
    surface: "web",
    status: "planned",
    captureMode: "plannedApi",
    userActionRequired: "(미구현) 사용자가 PR URL을 직접 입력 + 본문/Comment를 paste.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "GitHub OAuth는 명시적으로 Planned. 사용자가 데이터를 직접 paste / file import해야 함.",
    whatMoriCanAccess: ["(구현 시) 사용자가 URL을 입력하고 paste한 PR title / body / diff stats / commit messages"],
    whatMoriNeverAccesses: ["GitHub 자동 fetch", "repo 자동 스캔", "private 토큰 자동 사용"],
    setupRequirement: "현재는 manual paste + Git diff capture로 대체.",
    nextStep: "docs/connectors/github-pr-import.md 기반으로 PR paste importer 설계.",
    relatedIntegrationIds: ["gitDiff"],
  },
  {
    id: "fileDocumentImport",
    label: "파일 / 문서 import",
    toolFamily: "document",
    surface: "localFile",
    status: "planned",
    captureMode: "explicitFileImport",
    userActionRequired: "(미구현) 사용자가 .md / .pdf / .txt 파일을 직접 선택.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "verified",
    privacyBoundary: "선택한 파일만 읽습니다. 디렉터리 스캔은 추가하지 않습니다.",
    whatMoriCanAccess: ["(구현 시) 사용자가 명시적으로 선택한 파일의 텍스트"],
    whatMoriNeverAccesses: ["디렉터리 자동 스캔", "최근 파일 자동 추적", "파일 시스템 감시"],
    setupRequirement: "Tauri 파일 picker 통합 필요.",
    nextStep: "Markdown / 텍스트 importer 설계 (PDF는 별도 milestone).",
    relatedIntegrationIds: ["docs", "manualNote"],
  },
  {
    id: "mcpServer",
    label: "MCP server (Model Context Protocol)",
    toolFamily: "claude",
    surface: "extension",
    status: "planned",
    captureMode: "plannedMcp",
    userActionRequired: "(미구현) 사용자가 Mori MCP 서버를 호스트 앱(Claude Desktop 등)에 등록.",
    canCreateSource: false,
    canCreateEvents: false,
    canEnterImportReview: false,
    rawDataPolicy: "summaryOnly",
    trustDefault: "observed",
    privacyBoundary: "구현 시에도 호스트 앱이 보낸 데이터만 처리합니다. Mori가 호스트 앱을 자동으로 읽지 않습니다.",
    whatMoriCanAccess: ["(구현 시) MCP host가 명시적으로 Mori에 보낸 컨텍스트"],
    whatMoriNeverAccesses: ["호스트 앱 메모리", "auto-discovery", "background polling"],
    setupRequirement: "MCP server 미구현.",
    nextStep: "MCP 표준 안정화 + Mori transport 설계.",
    relatedIntegrationIds: ["claudeTranscript"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getAllCaptureSurfaces(): CaptureSurfaceRow[] {
  return CAPTURE_SURFACES.slice();
}

export function getCaptureSurfacesByFamily(
  family: CaptureSurfaceToolFamily,
): CaptureSurfaceRow[] {
  return CAPTURE_SURFACES.filter((row) => row.toolFamily === family);
}

export function getCaptureSurfacesByStatus(
  status: CaptureSurfaceStatus,
): CaptureSurfaceRow[] {
  return CAPTURE_SURFACES.filter((row) => row.status === status);
}

export function getImplementedCaptureSurfaces(): CaptureSurfaceRow[] {
  return CAPTURE_SURFACES.filter(
    (row) => row.status === "implemented" || row.status === "partial",
  );
}

export function getPlannedCaptureSurfaces(): CaptureSurfaceRow[] {
  return CAPTURE_SURFACES.filter(
    (row) =>
      row.status === "planned" ||
      row.status === "docsTemplateOnly" ||
      row.status === "manualOnly",
  );
}

/**
 * Look up the capture surface row that maps to a `SourceIntegration.id`
 * from `sourceRegistry.ts`. Used by Evidence Hub when it wants the
 * "honest status" copy without duplicating the registry data.
 */
export function getCaptureSurfaceForIntegration(
  integrationId: string,
): CaptureSurfaceRow | null {
  return (
    CAPTURE_SURFACES.find((row) =>
      row.relatedIntegrationIds.includes(integrationId),
    ) ?? null
  );
}

const STATUS_LABEL: Record<CaptureSurfaceStatus, string> = {
  implemented: "사용 가능",
  partial: "부분 구현",
  manualOnly: "수동 붙여넣기만 가능",
  docsTemplateOnly: "설정 템플릿",
  planned: "예정",
  unavailable: "사용 불가",
};

const STATUS_TONE: Record<
  CaptureSurfaceStatus,
  "green" | "blue" | "purple" | "gray" | "orange"
> = {
  implemented: "green",
  partial: "blue",
  manualOnly: "purple",
  docsTemplateOnly: "orange",
  planned: "gray",
  unavailable: "gray",
};

export type CaptureSurfaceStatusDescription = {
  label: string;
  tone: "green" | "blue" | "purple" | "gray" | "orange";
  short: string;
};

export function describeCaptureSurfaceStatus(
  row: CaptureSurfaceRow,
): CaptureSurfaceStatusDescription {
  const short = (() => {
    switch (row.status) {
      case "implemented":
        return "사용자가 직접 트리거하는 import 경로가 동작합니다.";
      case "partial":
        return "일부 기능만 구현됨. UI 또는 normalizer가 미완성.";
      case "manualOnly":
        return "manual paste만 지원. 구조화된 capture는 아직 없음.";
      case "docsTemplateOnly":
        return "Pure pipeline + setup template은 준비됨. UI는 다음 마일스톤.";
      case "planned":
        return "설계만 완료. capture / import는 미구현.";
      case "unavailable":
        return "플랫폼 제약으로 현재 환경에서는 동작하지 않음.";
    }
  })();
  return { label: STATUS_LABEL[row.status], tone: STATUS_TONE[row.status], short };
}

export type NextConnectorMilestone = {
  surfaceId: CaptureSurfaceId;
  label: string;
  nextStep: string;
  reason: "docsTemplateOnly" | "planned-priority" | "missing-ui";
};

/**
 * Pick the single most useful next connector milestone, given the current
 * state of the matrix. Today the highest-value step is: surface the
 * docs-only Claude Code hook / Codex CLI wrapper through a real Evidence
 * Hub "Connector JSONL" tab.
 */
export function getNextConnectorMilestone(): NextConnectorMilestone {
  const docsTemplate = CAPTURE_SURFACES.find(
    (row) => row.status === "docsTemplateOnly" && row.canEnterImportReview,
  );
  if (docsTemplate) {
    return {
      surfaceId: docsTemplate.id,
      label: docsTemplate.label,
      nextStep: docsTemplate.nextStep,
      reason: "missing-ui",
    };
  }
  // Otherwise pick the first planned surface in matrix order.
  const planned = CAPTURE_SURFACES.find((row) => row.status === "planned");
  if (planned) {
    return {
      surfaceId: planned.id,
      label: planned.label,
      nextStep: planned.nextStep,
      reason: "planned-priority",
    };
  }
  // Should not reach here while any surface is non-implemented.
  return {
    surfaceId: "manualNote",
    label: "직접 입력 메모",
    nextStep: "유지 — 모든 capture surface가 implemented 상태입니다.",
    reason: "docsTemplateOnly",
  };
}
