/**
 * Mori product flow — the canonical stages of the product loop.
 *
 * Capture → Normalize → Store → Review → Timeline → Extract → Summarize →
 * Report / Resume → Project Memory → Next Session
 *
 * This module sits ABOVE the existing registries:
 *   - `featureStatus.ts`  — per-capability honesty (47+ rows).
 *   - `connectors/captureSurfaces.ts` — paste / hook / CLI / desktop surfaces.
 *   - `sessionLifecycle.ts` — session timing + storage scope snapshot.
 *
 * It does NOT replace them. It provides:
 *   - a single enum of product stages,
 *   - a typed catalogue of product surfaces (Start Session, Evidence Hub, …),
 *   - helpers that ask cross-cutting questions ("what's the loop progress?",
 *     "what's the recommended next step?", "what data scope am I in?").
 *
 * Honesty contract: every helper below must derive its result from facts
 * (registry rows + runtime mode + session snapshot). No inline string copy
 * that could drift from the registries.
 */
import type { FeatureCapability, FeatureId, FeatureStatus } from "./featureStatus";
import {
  FEATURE_REGISTRY,
  FEATURE_STATUS_LABEL,
  FEATURE_STATUS_TONE,
  countFeaturesByStatus,
  getFeature,
} from "./featureStatus";
import type { SessionLifecycleSnapshot } from "./sessionLifecycle";

// ─── Stages ─────────────────────────────────────────────────────────────────

export type ProductStage =
  | "capture"
  | "normalize"
  | "store"
  | "review"
  | "timeline"
  | "extract"
  | "summarize"
  | "report"
  | "projectMemory"
  | "nextSession";

export const PRODUCT_STAGES: ProductStage[] = [
  "capture",
  "normalize",
  "store",
  "review",
  "timeline",
  "extract",
  "summarize",
  "report",
  "projectMemory",
  "nextSession",
];

export type ProductStageDescriptor = {
  id: ProductStage;
  label: string;
  /** Brief sentence describing what happens in this stage. */
  description: string;
  /** Feature ids that must be functional for the stage to count as live. */
  requiredFeatureIds: FeatureId[];
  /** Feature ids that improve the stage but aren't strictly required. */
  optionalFeatureIds: FeatureId[];
};

/**
 * Stage catalogue. Rows are ordered along the product loop so callers can
 * walk them in order to render a progress strip.
 */
export const PRODUCT_STAGE_CATALOG: Record<ProductStage, ProductStageDescriptor> = {
  capture: {
    id: "capture",
    label: "Capture",
    description: "사용자가 직접 가져온 paste / hook / CLI / desktop diff 소스를 받습니다.",
    requiredFeatureIds: [
      "evidence.addSource.manualNote",
      "evidence.addSource.urlImport",
      "evidence.addSource.aiTranscriptPaste",
      "evidence.addSource.gitDiffPaste",
    ],
    optionalFeatureIds: [
      "evidence.addSource.tauriGitDiff",
      "evidence.addSource.connectorJsonl",
    ],
  },
  normalize: {
    id: "normalize",
    label: "Normalize",
    description: "원본 paste / hook 데이터를 정형화된 SourceRef + TimelineEvent 후보로 변환합니다.",
    requiredFeatureIds: [
      "evidence.addSource.manualNote",
      "evidence.addSource.aiTranscriptPaste",
    ],
    optionalFeatureIds: [],
  },
  store: {
    id: "store",
    label: "Store",
    description: "브라우저 draft 또는 desktop SQLite에 세션을 저장합니다.",
    requiredFeatureIds: ["settings.storage.browserDraft"],
    optionalFeatureIds: [
      "settings.storage.desktopSqlite",
      "settings.storage.moriPackageJson",
    ],
  },
  review: {
    id: "review",
    label: "Review",
    description: "Import Review에서 사용자가 후보 이벤트를 accept / discard / edit 합니다.",
    requiredFeatureIds: ["evidence.addSource.aiTranscriptPaste"],
    optionalFeatureIds: [],
  },
  timeline: {
    id: "timeline",
    label: "Timeline",
    description: "Lane / 시간 ruler / Inspector로 세션을 구조적으로 읽습니다.",
    requiredFeatureIds: [
      "timeline.density",
      "timeline.filter",
      "timeline.search",
      "timeline.range.session",
    ],
    optionalFeatureIds: ["timeline.inspector.flowTrace"],
  },
  extract: {
    id: "extract",
    label: "Extract",
    description: "Quick Pass 분석으로 이슈 / 결정 / 다음 액션을 추출합니다.",
    requiredFeatureIds: ["evidence.runQuickPass", "settings.localAi.deterministic"],
    optionalFeatureIds: ["settings.localAi.ollama"],
  },
  summarize: {
    id: "summarize",
    label: "Summarize",
    description: "세션 요약과 Resume 프롬프트를 생성합니다.",
    requiredFeatureIds: ["reports.copyResumePrompt"],
    optionalFeatureIds: [],
  },
  report: {
    id: "report",
    label: "Report / Resume",
    description: "Markdown 리포트와 .mori v0 JSON 패키지를 내보냅니다.",
    requiredFeatureIds: ["reports.export.markdown"],
    optionalFeatureIds: [
      "reports.export.moriPackage",
      "reports.export.pdf",
      "reports.export.html",
    ],
  },
  projectMemory: {
    id: "projectMemory",
    label: "Project Memory",
    description: "현재 세션을 토대로 프로젝트 메모리 스냅샷을 제공합니다.",
    requiredFeatureIds: ["memory.followUpPrompt"],
    optionalFeatureIds: ["memory.crossSessionAggregation"],
  },
  nextSession: {
    id: "nextSession",
    label: "Next Session",
    description: "다음 세션 시작을 위한 follow-up prompt + Start Session 흐름.",
    requiredFeatureIds: [
      "startSession.savePersistedDraft",
      "memory.followUpPrompt",
    ],
    optionalFeatureIds: ["appShell.endSession"],
  },
};

// ─── Surfaces ───────────────────────────────────────────────────────────────

export type ProductSurfaceId =
  | "startSession"
  | "evidenceHub"
  | "importReview"
  | "timeline"
  | "flowFocus"
  | "review"
  | "reports"
  | "projectMemory"
  | "settings"
  | "connectorSetup";

export type ProductSurfaceDescriptor = {
  id: ProductSurfaceId;
  label: string;
  description: string;
  /** Feature ids that this surface either owns or directly drives. */
  ownedFeatureIds: FeatureId[];
  /** Doc path describing this surface. */
  docsPath?: string;
};

export const PRODUCT_SURFACES: Record<ProductSurfaceId, ProductSurfaceDescriptor> = {
  startSession: {
    id: "startSession",
    label: "Start Session",
    description: "세션 스코프 + 소스 선택 + 로컬 AI 엔진 선택.",
    ownedFeatureIds: [
      "startSession.savePersistedDraft",
      "startSession.sourceTileSelection",
    ],
    docsPath: "docs/product-screen-reference.md#start-session-session-setup",
  },
  evidenceHub: {
    id: "evidenceHub",
    label: "Evidence Hub",
    description: "Available + Planned 통합 카드 + 가져온 소스 + Quick Pass.",
    ownedFeatureIds: [
      "evidence.addSource.manualNote",
      "evidence.addSource.urlImport",
      "evidence.addSource.aiTranscriptPaste",
      "evidence.addSource.gitDiffPaste",
      "evidence.addSource.tauriGitDiff",
      "evidence.addSource.connectorJsonl",
      "evidence.removeImport",
      "evidence.runQuickPass",
    ],
    docsPath: "docs/product-screen-reference.md#evidence-hub",
  },
  importReview: {
    id: "importReview",
    label: "Import Review",
    description: "후보 이벤트 / 이슈 / 결정 검토 후 세션에 적용.",
    ownedFeatureIds: ["evidence.addSource.aiTranscriptPaste"],
    docsPath: "docs/product-screen-reference.md#import-review--evidence-mapping",
  },
  timeline: {
    id: "timeline",
    label: "Timeline",
    description: "Mori 핵심 reading surface — lanes, ruler, inspector, mini-map.",
    ownedFeatureIds: [
      "timeline.density",
      "timeline.filter",
      "timeline.search",
      "timeline.range.session",
      "timeline.range.day",
      "timeline.range.week",
      "timeline.zoom.in",
      "timeline.zoom.out",
      "timeline.activeLanesOnly",
      "timeline.inspector.flowTrace",
      "timeline.inspector.copySummary",
      "timeline.inspector.editEvent",
      "timeline.inspector.split",
      "timeline.inspector.merge",
      "timeline.inspector.createIssue",
      "timeline.inspector.addNote",
      "timeline.inspector.memoSave",
    ],
    docsPath: "docs/timeline-ux.md",
  },
  flowFocus: {
    id: "flowFocus",
    label: "Flow Focus",
    description: "선택한 이벤트의 upstream / downstream 관계를 시각화.",
    ownedFeatureIds: ["timeline.inspector.flowTrace"],
    docsPath: "docs/product-screen-reference.md#flow-focus--trace-view",
  },
  review: {
    id: "review",
    label: "Review Workspace",
    description: "Issue Garden / Decision Log / Next Actions / Unresolved / Suggestions.",
    ownedFeatureIds: [
      "review.statusChange",
      "review.editIssue",
      "review.confirmDecision",
      "review.promoteToNextAction",
    ],
    docsPath: "docs/product-screen-reference.md#review",
  },
  reports: {
    id: "reports",
    label: "Reports",
    description: "Resume prompt + Markdown 리포트 + .mori v0 JSON.",
    ownedFeatureIds: [
      "reports.export.markdown",
      "reports.export.pdf",
      "reports.export.html",
      "reports.export.moriPackage",
      "reports.copyResumePrompt",
      "reports.rerunQuickPass",
    ],
    docsPath: "docs/product-screen-reference.md#reports--resume-prompt",
  },
  projectMemory: {
    id: "projectMemory",
    label: "Project Memory",
    description: "프로젝트 단위 메모리 스냅샷 (현재 세션 단위만 집계).",
    ownedFeatureIds: [
      "memory.savedSessions",
      "memory.recurringIssues",
      "memory.followUpPrompt",
      "memory.crossSessionAggregation",
    ],
    docsPath: "docs/product-screen-reference.md#project-memory",
  },
  settings: {
    id: "settings",
    label: "Settings",
    description: "Privacy / Local AI / Storage / Repositories.",
    ownedFeatureIds: [
      "settings.localAi.deterministic",
      "settings.localAi.ollama",
      "settings.localAi.lmStudio",
      "settings.localAi.openAiCompatible",
      "settings.localAi.cloudApi",
      "settings.storage.browserDraft",
      "settings.storage.desktopSqlite",
      "settings.storage.moriPackageJson",
      "settings.storage.moriPackageZip",
      "settings.repositories.crud",
      "settings.themeSwitcher",
    ],
    docsPath: "docs/product-screen-reference.md#settings--privacy--local-ai",
  },
  connectorSetup: {
    id: "connectorSetup",
    label: "Connector Setup",
    description: "Claude Code hook / Codex CLI wrapper / IDE / Terminal / Browser 커넥터 안내.",
    ownedFeatureIds: ["evidence.addSource.connectorJsonl"],
    docsPath: "docs/connectors/capture-surface-matrix.md",
  },
};

// ─── Data scope ─────────────────────────────────────────────────────────────

export type DataScope =
  | "demo"
  | "currentSession"
  | "browserDraft"
  | "desktopSQLite"
  | "moriPackage"
  | "crossSessionPlanned";

export const DATA_SCOPE_LABEL: Record<DataScope, string> = {
  demo: "Demo data",
  currentSession: "Current session",
  browserDraft: "Browser draft",
  desktopSQLite: "Desktop SQLite",
  moriPackage: ".mori v0 package",
  crossSessionPlanned: "Cross-session (planned)",
};

export const DATA_SCOPE_TONE: Record<
  DataScope,
  "purple" | "blue" | "green" | "gray" | "orange"
> = {
  demo: "purple",
  currentSession: "blue",
  browserDraft: "blue",
  desktopSQLite: "green",
  moriPackage: "green",
  crossSessionPlanned: "orange",
};

// ─── Runtime ────────────────────────────────────────────────────────────────

export type RuntimeMode = "browser" | "desktop" | "unknown";

export const RUNTIME_MODE_LABEL: Record<RuntimeMode, string> = {
  browser: "Browser prototype",
  desktop: "Desktop (Tauri)",
  unknown: "Unknown",
};

// ─── Capture / Storage / Analysis status ────────────────────────────────────

export type CaptureStatus = "none" | "manualOnly" | "manualPlusDesktop" | "connectorJsonl";

export type StorageStatus = "demo" | "browserDraft" | "desktopSqlite" | "ended";

export type AnalysisStatus = "none" | "deterministic" | "ollama" | "fallback" | "failed";

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getFeatureStatusLabel(status: FeatureStatus): string {
  return FEATURE_STATUS_LABEL[status];
}

export function getFeatureStatusTone(status: FeatureStatus): "green" | "blue" | "orange" | "gray" {
  return FEATURE_STATUS_TONE[status];
}

export function isFeatureActionEnabled(id: FeatureId): boolean {
  return getFeature(id).actionEnabled;
}

export type SurfaceStatusSummary = {
  surface: ProductSurfaceId;
  label: string;
  /** Coarse rollup status: implemented if everything is implemented; partial
   *  if at least one capability works; planned if everything is planned. */
  status: FeatureStatus;
  statusLabel: string;
  tone: "green" | "blue" | "orange" | "gray";
  /** Per-status counts across the surface's owned features. */
  counts: Record<FeatureStatus, number>;
  /** Total feature rows owned by the surface. */
  total: number;
};

/**
 * Roll up the per-feature statuses of one surface into a single summary row.
 */
export function getSurfaceStatus(surfaceId: ProductSurfaceId): SurfaceStatusSummary {
  const surface = PRODUCT_SURFACES[surfaceId];
  const counts: Record<FeatureStatus, number> = {
    implemented: 0,
    partial: 0,
    planned: 0,
    unavailable: 0,
  };
  for (const id of surface.ownedFeatureIds) {
    counts[FEATURE_REGISTRY[id].status] += 1;
  }
  const total = surface.ownedFeatureIds.length;
  const status: FeatureStatus = rollupStatus(counts);
  return {
    surface: surfaceId,
    label: surface.label,
    status,
    statusLabel: FEATURE_STATUS_LABEL[status],
    tone: FEATURE_STATUS_TONE[status],
    counts,
    total,
  };
}

function rollupStatus(counts: Record<FeatureStatus, number>): FeatureStatus {
  if (counts.implemented > 0 && counts.planned === 0 && counts.partial === 0 && counts.unavailable === 0) {
    return "implemented";
  }
  if (counts.implemented + counts.partial > 0) {
    return counts.implemented > counts.planned ? "partial" : "partial";
  }
  if (counts.planned > 0) return "planned";
  return "unavailable";
}

export type StageProgress = {
  stage: ProductStage;
  label: string;
  description: string;
  /** Stage is live when every required feature is implemented or partial. */
  status: FeatureStatus;
  statusLabel: string;
  tone: "green" | "blue" | "orange" | "gray";
  /** Required features whose status is currently below "partial". */
  blockingFeatures: FeatureCapability[];
  /** Optional features that would lift the stage's quality. */
  upgradeFeatures: FeatureCapability[];
};

/**
 * Walk the product loop in order and report each stage's status.
 */
export function getProductLoopProgress(): StageProgress[] {
  return PRODUCT_STAGES.map((stage) => {
    const descriptor = PRODUCT_STAGE_CATALOG[stage];
    const required = descriptor.requiredFeatureIds.map((id) => FEATURE_REGISTRY[id]);
    const optional = descriptor.optionalFeatureIds.map((id) => FEATURE_REGISTRY[id]);
    const blocking = required.filter((row) => row.status === "planned" || row.status === "unavailable");
    const status: FeatureStatus = blocking.length === 0
      ? required.every((row) => row.status === "implemented")
        ? "implemented"
        : "partial"
      : required.every((row) => row.status === "planned") ? "planned" : "partial";
    return {
      stage,
      label: descriptor.label,
      description: descriptor.description,
      status,
      statusLabel: FEATURE_STATUS_LABEL[status],
      tone: FEATURE_STATUS_TONE[status],
      blockingFeatures: blocking,
      upgradeFeatures: optional.filter((row) => row.status !== "implemented"),
    };
  });
}

/**
 * Translate a session lifecycle snapshot + runtime into the canonical
 * DataScope tag. Used by Project Memory, Reports, and the Sidebar so
 * "where is this data coming from?" gets one answer.
 */
export function getRuntimeDataScope(args: {
  lifecycle: SessionLifecycleSnapshot;
  runtime: RuntimeMode;
}): DataScope {
  if (args.lifecycle.isDemo) return "demo";
  if (args.lifecycle.storageScope === "desktop-sqlite") return "desktopSQLite";
  if (args.lifecycle.storageScope === "browser-draft") return "browserDraft";
  if (args.lifecycle.storageScope === "ended") {
    return args.runtime === "desktop" ? "desktopSQLite" : "browserDraft";
  }
  return "currentSession";
}

export type RecommendedNextStep = {
  stage: ProductStage;
  feature: FeatureCapability | null;
  message: string;
};

/**
 * Walk the product loop and recommend a single next step. The first stage
 * that's not at least "partial" wins; if everything is live, recommend the
 * highest-upgrade optional feature.
 */
export function getRecommendedNextStep(args: {
  /** Optional: pass the lifecycle snapshot to bias toward Capture / Extract
   *  recommendations for empty / unanalysed sessions. */
  lifecycle?: SessionLifecycleSnapshot;
  importCount?: number;
  hasAnalysis?: boolean;
}): RecommendedNextStep {
  const progress = getProductLoopProgress();

  // 1. Session-aware shortcuts.
  if (args.lifecycle && !args.lifecycle.isDemo) {
    if ((args.importCount ?? 0) === 0) {
      return {
        stage: "capture",
        feature: FEATURE_REGISTRY["evidence.addSource.aiTranscriptPaste"],
        message: "Evidence Hub에서 첫 소스를 가져오세요.",
      };
    }
    if (!args.hasAnalysis) {
      return {
        stage: "extract",
        feature: FEATURE_REGISTRY["evidence.runQuickPass"],
        message: "Evidence / Reports에서 Quick Pass를 실행하세요.",
      };
    }
  }

  // 2. First stage with a blocking feature.
  const stuck = progress.find((row) => row.blockingFeatures.length > 0);
  if (stuck) {
    return {
      stage: stuck.stage,
      feature: stuck.blockingFeatures[0] ?? null,
      message: stuck.blockingFeatures[0]?.disabledReason ?? `${stuck.label}에 막힌 항목이 있습니다.`,
    };
  }

  // 3. Top upgrade feature.
  const upgrade = progress.find((row) => row.upgradeFeatures.length > 0);
  if (upgrade) {
    return {
      stage: upgrade.stage,
      feature: upgrade.upgradeFeatures[0] ?? null,
      message: upgrade.upgradeFeatures[0]?.disabledReason
        ?? `${upgrade.label}의 선택 기능을 개선할 수 있습니다.`,
    };
  }

  return {
    stage: "nextSession",
    feature: null,
    message: "모든 핵심 단계가 활성화되어 있습니다. 다음 세션을 시작하세요.",
  };
}

/**
 * Cheap overview helper for status strips. Counts come from the existing
 * registry helper.
 */
export function getFeatureRegistryOverview(): {
  total: number;
  counts: Record<FeatureStatus, number>;
} {
  const counts = countFeaturesByStatus();
  return {
    total: counts.implemented + counts.partial + counts.planned + counts.unavailable,
    counts,
  };
}
