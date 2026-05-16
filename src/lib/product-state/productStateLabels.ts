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
 * This file is the single data source for three product-state families:
 *
 *   - Availability — can the user use this capability today?
 *   - Runtime / storage — where does the data actually live right now?
 *   - Data / provenance — how did this data reach Mori, and how durable is it?
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
    label: "Available",
    description: "지금 바로 사용할 수 있는 기능입니다.",
    tone: "success",
  },
  partial: {
    label: "Partial",
    description: "일부만 동작하며 아직 남은 범위가 있습니다.",
    tone: "info",
  },
  planned: {
    label: "Planned",
    description: "설계되었지만 아직 구현되지 않았습니다.",
    tone: "warning",
    hint: "다음 마일스톤까지 비활성 상태로 유지됩니다.",
  },
  unavailable: {
    label: "Unavailable",
    description: "현재 런타임에서는 사용할 수 없습니다.",
    tone: "neutral",
  },
  requiresSetup: {
    label: "Requires setup",
    description: "사용자가 먼저 설정을 마쳐야 동작합니다.",
    tone: "warning",
    hint: "설정을 마치기 전까지 비활성 상태로 유지됩니다.",
  },
  demoOnly: {
    label: "Demo only",
    description: "데모 데이터에서만 존재하며 실제 캡처는 없습니다.",
    tone: "accent",
  },
  browserOnly: {
    label: "Browser only",
    description: "브라우저 prototype 모드에서만 동작합니다.",
    tone: "info",
  },
  desktopOnly: {
    label: "Desktop only",
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
    label: "가져옴",
    description: "사용자가 명시적으로 가져온 데이터입니다.",
    tone: "info",
  },
  clientSafe: {
    label: "Client-safe",
    description: "외부 공유에 안전하도록 필터링된 데이터입니다.",
    tone: "success",
  },
  inferred: {
    label: "Inferred",
    description: "AI가 소스와 맥락을 바탕으로 추론한 항목입니다.",
    tone: "inferred",
  },
  verified: {
    label: "Verified",
    description: "원본 근거가 명확한 항목입니다.",
    tone: "verified",
  },
  observed: {
    label: "Observed",
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
