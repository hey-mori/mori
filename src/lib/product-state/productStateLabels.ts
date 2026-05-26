/**
 * Mori product-state labels — the shared label / description / tone tables
 * for the app's core product states.
 *
 * Before this module, "is this feature available?", "which storage backend
 * is live?", and "how trustworthy is this evidence?" were each answered by a
 * separate, hand-rolled label + tone map (`featureStatus.ts`,
 * `MoriStatusBadge`, `settingsStatus.ts`, `evidence/provenance.ts`,
 * `LocalAiCard.tsx`, `IntegrationCard.tsx`). The vocabularies drifted.
 *
 * This file is the single data source for five product-state families:
 *
 *   - Availability — can the user use this capability today?
 *   - Runtime / storage — where does the data actually live right now?
 *   - Data / provenance — how did this data reach Mori, and how durable is it?
 *   - Memory lifecycle — what state is a durable accepted memory in?
 *   - Companion — why is Mori surfacing a signal or prompt?
 *
 * `productState.ts` adds the typed derivations on top of these tables;
 * components and pure helpers should import from there.
 *
 * Label honesty contract:
 *   - Availability labels stay English on purpose. `Available / Partial /
 *     Planned / Unavailable` is the canonical product status vocabulary
 *     already used by `featureStatus.ts` and the docs — keeping it English
 *     keeps every honesty surface consistent.
 *   - Runtime / storage and data / provenance labels follow the convention
 *     of the surfaces that render them: Korean copy for Korean surfaces,
 *     with product terms (`localStorage`, `SQLite`, `Client-safe`) left as-is.
 */

/**
 * One semantic tone vocabulary, shared with `MoriStatusBadge` and the
 * `data-mori-tone` rules in `styles/theme.css`. Every product state maps to
 * exactly one of these.
 */
export type ProductStateTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "accent"
  | "neutral"
  | "verified"
  | "observed"
  | "inferred";

/** Can the user use this capability today, and if not, why? */
export type ProductAvailabilityState =
  | "available"
  | "partial"
  | "planned"
  | "unavailable"
  | "requiresSetup"
  | "demoOnly"
  | "browserOnly"
  | "desktopOnly";

/** Where the data actually lives in the current runtime. */
export type ProductRuntimeState =
  | "browserLocalStorage"
  | "desktopSQLite"
  | "fallbackActive"
  | "localOnly";

/**
 * Lifecycle status of a durable accepted Project Memory record. Mirrors
 * `StoredAcceptedProjectMemoryStatus` in `storage/storageTypes.ts` — kept
 * as its own type here so the product-state model has no upward dependency
 * on the storage layer.
 */
export type ProductMemoryStatusState =
  | "accepted"
  | "edited"
  | "watching"
  | "deferred"
  | "stale"
  | "contradicted"
  | "superseded"
  | "retired";

/** How a piece of data reached Mori and how durably it is retained. */
export type ProductDataState =
  | "imported"
  | "clientSafe"
  | "inferred"
  | "verified"
  | "observed"
  | "userProvided"
  | "summaryOnly"
  | "fullTextRetained";

/**
 * Why the Companion layer is surfacing a signal or prompt. `info` /
 * `suggestion` / `review` / `risk` are the severity tiers a companion
 * signal carries (mirroring `CompanionSignalSeverity`); `needsReview` /
 * `readyToReport` / `readyToResume` are the named outcome states a signal
 * can describe. A companion signal is always a reviewable suggestion —
 * never an automatic action — so none of these imply Mori acted on its own.
 */
export type ProductCompanionState =
  | "info"
  | "suggestion"
  | "review"
  | "risk"
  | "needsReview"
  | "readyToReport"
  | "readyToResume";

export type ProductStateDisplay = {
  /** Display label following the rendering surface's language convention. */
  label: string;
  /** One-line Korean explanation of the state. */
  description: string;
  /** Semantic tone, shared with `MoriStatusBadge` / theme tokens. */
  tone: ProductStateTone;
  /** Optional extra UI hint (tooltip / sub-copy). */
  hint?: string;
};

/**
 * Availability — English status terms on purpose (see the file header).
 */
export const PRODUCT_AVAILABILITY_LABELS: Record<
  ProductAvailabilityState,
  ProductStateDisplay
> = {
  available: {
    label: "사용 가능",
    description: "지금 바로 사용할 수 있는 기능입니다.",
    tone: "success",
  },
  partial: {
    label: "부분 구현",
    description: "일부만 동작하며 아직 남은 범위가 있습니다.",
    tone: "info",
  },
  planned: {
    label: "예정",
    description: "설계되었지만 아직 구현되지 않았습니다.",
    tone: "warning",
    hint: "다음 마일스톤까지 비활성 상태로 유지됩니다.",
  },
  unavailable: {
    label: "사용 불가",
    description: "현재 런타임에서는 사용할 수 없습니다.",
    tone: "neutral",
  },
  requiresSetup: {
    label: "설정 필요",
    description: "사용자가 먼저 설정을 마쳐야 동작합니다.",
    tone: "warning",
    hint: "설정을 마치기 전까지 비활성 상태로 유지됩니다.",
  },
  demoOnly: {
    label: "데모 전용",
    description: "데모 데이터에서만 존재하며 실제 캡처는 없습니다.",
    tone: "accent",
  },
  browserOnly: {
    label: "브라우저 전용",
    description: "브라우저 prototype 모드에서만 동작합니다.",
    tone: "info",
  },
  desktopOnly: {
    label: "데스크톱 전용",
    description: "Tauri 데스크톱 앱에서만 동작합니다.",
    tone: "info",
  },
};

/**
 * Runtime / storage — Korean copy with product terms left as-is.
 */
export const PRODUCT_RUNTIME_LABELS: Record<
  ProductRuntimeState,
  ProductStateDisplay
> = {
  browserLocalStorage: {
    label: "브라우저 localStorage",
    description: "브라우저 prototype 모드의 로컬 임시 저장소입니다.",
    tone: "info",
  },
  desktopSQLite: {
    label: "데스크톱 SQLite",
    description: "Tauri 데스크톱 앱의 영속 로컬 SQLite 저장소입니다.",
    tone: "success",
  },
  fallbackActive: {
    label: "localStorage 폴백",
    description: "SQLite를 사용할 수 없어 localStorage로 대체 중입니다.",
    tone: "warning",
    hint: "데스크톱 모드에서도 fallback 경로는 정직하게 표시됩니다.",
  },
  localOnly: {
    label: "로컬 전용",
    description: "데이터가 이 기기 밖으로 나가지 않습니다.",
    tone: "neutral",
  },
};

/**
 * Data / provenance — Korean copy, with the canonical trust terms
 * (`Verified / Observed / Inferred`, mirroring `evidence/trust.ts`) and the
 * `Client-safe` product term left in English.
 */
export const PRODUCT_DATA_LABELS: Record<ProductDataState, ProductStateDisplay> = {
  imported: {
    label: "가져온 소스",
    description: "사용자가 명시적으로 가져온 데이터입니다.",
    tone: "info",
  },
  clientSafe: {
    label: "클라이언트 안전",
    description: "외부 공유에 안전하도록 필터링된 데이터입니다.",
    tone: "success",
  },
  inferred: {
    label: "추론됨",
    description: "소스와 맥락을 바탕으로 추론한 항목입니다.",
    tone: "inferred",
  },
  verified: {
    label: "검증됨",
    description: "원본 근거가 명확한 항목입니다.",
    tone: "verified",
  },
  observed: {
    label: "관찰됨",
    description: "시스템이 관찰했지만 의미 해석이 필요한 항목입니다.",
    tone: "observed",
  },
  userProvided: {
    label: "사용자 입력",
    description: "사용자가 직접 작성하거나 붙여넣은 데이터입니다.",
    tone: "verified",
  },
  summaryOnly: {
    label: "요약만 보관",
    description: "원본 전체가 아닌 요약·메타데이터만 저장합니다.",
    tone: "neutral",
  },
  fullTextRetained: {
    label: "원본 전체 보관",
    description: "원본 텍스트가 그대로 로컬에 보관됩니다.",
    tone: "info",
  },
};

/**
 * Memory lifecycle — Korean copy. The tone follows the four lifecycle
 * groups (`memoryLifecycle.ts`): `accepted` / `edited` are current
 * guidance (success), `watching` / `deferred` are advisory (info),
 * `stale` / `contradicted` need attention (warning / danger — a
 * contradiction is the more severe of the two), and `superseded` /
 * `retired` are archived without deletion (neutral).
 */
export const PRODUCT_MEMORY_STATUS_LABELS: Record<
  ProductMemoryStatusState,
  ProductStateDisplay
> = {
  accepted: {
    label: "수락",
    description: "검토 후 승인되어 현재 지침으로 쓰이는 메모리입니다.",
    tone: "success",
  },
  edited: {
    label: "편집",
    description: "사용자가 내용을 수정한 뒤 승인한 메모리입니다.",
    tone: "success",
  },
  watching: {
    label: "관찰",
    description: "중요하지만 아직 확정하지 않고 지켜보는 메모리입니다.",
    tone: "info",
  },
  deferred: {
    label: "연기",
    description: "다음 검토까지 판단을 미룬 메모리입니다.",
    tone: "info",
  },
  stale: {
    label: "오래됨",
    description: "근거가 오래되어 다시 검토가 필요한 메모리입니다.",
    tone: "warning",
  },
  contradicted: {
    label: "상충",
    description: "다른 메모리와 충돌해 확인이 필요한 메모리입니다.",
    tone: "danger",
  },
  superseded: {
    label: "대체됨",
    description: "더 새로운 메모리로 대체되어 보관된 항목입니다.",
    tone: "neutral",
  },
  retired: {
    label: "사용 중지",
    description: "더 이상 지침으로 쓰이지 않고 보관된 항목입니다.",
    tone: "neutral",
  },
};

/**
 * Companion — Korean copy. Tones keep the existing Companion dot scale: a
 * `risk` signal is the most urgent (danger), `review` / `needsReview` ask
 * for a review pass (warning), `suggestion` is a gentle nudge (info),
 * `info` is the calmest tier (neutral). `readyToReport` / `readyToResume`
 * are positive continuation states (success / info) — they describe that a
 * step is *available*, never that Mori has taken it.
 */
export const PRODUCT_COMPANION_STATE_LABELS: Record<
  ProductCompanionState,
  ProductStateDisplay
> = {
  info: {
    label: "정보",
    description: "지금 알아두면 좋은 정보입니다.",
    tone: "neutral",
  },
  suggestion: {
    label: "제안",
    description: "해보면 좋은 다음 단계 제안입니다.",
    tone: "info",
    hint: "제안일 뿐 — Mori가 자동으로 실행하지 않습니다.",
  },
  review: {
    label: "검토 필요",
    description: "다음 작업 전에 검토해 두면 좋은 항목입니다.",
    tone: "warning",
  },
  risk: {
    label: "주의",
    description: "근거가 약하거나 놓치면 위험할 수 있어 우선 확인이 필요합니다.",
    tone: "danger",
  },
  needsReview: {
    label: "검토 대기",
    description: "확정하기 전에 사용자의 검토가 필요한 항목입니다.",
    tone: "warning",
  },
  readyToReport: {
    label: "보고 준비",
    description: "보고서로 정리할 준비가 된 상태입니다.",
    tone: "success",
  },
  readyToResume: {
    label: "이어가기 준비",
    description: "다음 세션으로 이어갈 수 있는 상태입니다.",
    tone: "info",
  },
};
