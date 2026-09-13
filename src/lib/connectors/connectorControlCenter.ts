/**
 * Source / Connector Control Center view-model.
 *
 * A pure, runtime-aware derivation over the {@link getAllCaptureSurfaces}
 * matrix. The point of this module is to give the UI one honest answer per
 * source: is it usable right now, does it need the desktop app, does it need a
 * setup step, or is it merely planned — plus where its import lands and what
 * Mori can / cannot read. The matrix is the source of truth; this layer only
 * groups, classifies for the current runtime, and resolves an action. It never
 * invents a connected state and never makes a planned surface importable.
 */

import {
  describeCaptureSurfaceStatus,
  getAllCaptureSurfaces,
  type CaptureSurfaceId,
  type CaptureSurfaceRawDataPolicy,
  type CaptureSurfaceRow,
  type CaptureSurfaceStatus,
  type CaptureSurfaceStatusDescription,
  type CaptureSurfaceToolFamily,
} from "./captureSurfaces";

/**
 * Whether a source family *anchors* a work session or only *attaches evidence*
 * to one. A Mori session is one AI-agent work session: a single Claude / Codex
 * / OpenCode conversation is its spine, and git / terminal / file / note
 * evidence attaches to that spine. So the AI-agent families are session
 * anchors; every other family is evidence you add to an existing session.
 */
export type ControlCenterFamilyRole = "agent" | "evidence";

/** Runtime-aware usability of a capture surface in the Control Center. */
export type ControlCenterAvailability =
  /** Implemented / partial and usable right now in this runtime. */
  | "available"
  /** Implemented but requires the Tauri desktop app (we are in the browser). */
  | "needsDesktopApp"
  /** A shipped template / hook / wrapper the user must install before it works. */
  | "needsSetup"
  /** Designed, not built. */
  | "planned"
  /** Not usable in the current runtime / platform. */
  | "unavailable";

/** Which Evidence import surface a Control Center action opens. */
export type ControlCenterImportKind = "note" | "url" | "ai" | "git" | "connector";

/** Optional AI-platform hint carried into the AI transcript import tab. */
export type ControlCenterAiPlatform = "claude" | "chatgpt" | "codex" | "other";

/** What a surface's primary action does. */
export type ControlCenterActionKind =
  /** Open the Evidence import drawer on a specific tab. */
  | "evidenceImport"
  /** No action — planned / unavailable surfaces stay inert and honest. */
  | "none";

export type ControlCenterAction = {
  kind: ControlCenterActionKind;
  /** Button label (Korean, matches surrounding copy). */
  label: string;
  /** Whether the action can be triggered in the current runtime / session. */
  enabled: boolean;
  /** Why the action is disabled, when it is — shown as the button tooltip. */
  disabledReason?: string;
  /** For `evidenceImport`: which import tab opens. */
  importKind?: ControlCenterImportKind;
  /** For `evidenceImport` AI transcripts: preselected platform. */
  importPlatform?: ControlCenterAiPlatform;
};

export type ControlCenterSurface = {
  id: CaptureSurfaceId;
  label: string;
  toolFamily: CaptureSurfaceToolFamily;
  status: CaptureSurfaceStatus;
  availability: ControlCenterAvailability;
  statusDescription: CaptureSurfaceStatusDescription;
  /** One-line privacy guarantee. */
  privacyBoundary: string;
  /** What Mori can read once this surface is in use. */
  whatMoriCanAccess: string[];
  /** What Mori never reads silently. */
  whatMoriNeverAccesses: string[];
  /** The explicit click / paste / install the user must perform. */
  userActionRequired: string;
  /** What must be installed / configured first. */
  setupRequirement: string;
  /** The single concrete next step that moves this surface forward. */
  nextStep: string;
  /** True for the intended primary capture path (the local hook / CLI wrapper). */
  recommended: boolean;
  rawDataPolicy: CaptureSurfaceRawDataPolicy;
  action: ControlCenterAction;
};

export type ControlCenterGroup = {
  family: CaptureSurfaceToolFamily;
  label: string;
  /** Session anchor (AI agent) or evidence attached to a session. */
  role: ControlCenterFamilyRole;
  surfaces: ControlCenterSurface[];
};

export type ControlCenterCounts = {
  available: number;
  needsDesktopApp: number;
  needsSetup: number;
  planned: number;
  unavailable: number;
  total: number;
};

export type ConnectorControlCenterViewModel = {
  groups: ControlCenterGroup[];
  counts: ControlCenterCounts;
};

export type BuildControlCenterInput = {
  /** True when running inside the Tauri desktop app. */
  isDesktop: boolean;
  /**
   * True when an editable (non-demo) session is active. Import actions can
   * only land work into a real session, so they stay disabled otherwise.
   */
  hasActiveSession: boolean;
};

// ---------------------------------------------------------------------------
// Family presentation
// ---------------------------------------------------------------------------

/**
 * Families shown in the Control Center, in display order. `analysis` (Quick
 * Pass) is intentionally excluded — it is a derivation over already-imported
 * evidence, not a way to connect a new source.
 */
const FAMILY_ORDER: CaptureSurfaceToolFamily[] = [
  "claude",
  "codex",
  "opencode",
  "git",
  "terminal",
  "manual",
  "document",
  "ide",
  "browser",
];

/**
 * AI-agent families — the ones that anchor a work session. Everything else is
 * evidence attached to a session. Kept as a set so the role derivation has one
 * source of truth.
 */
const AGENT_FAMILIES: ReadonlySet<CaptureSurfaceToolFamily> = new Set([
  "claude",
  "codex",
  "opencode",
]);

/** A family anchors a session (AI agent) or contributes evidence to one. */
export function familyRole(family: CaptureSurfaceToolFamily): ControlCenterFamilyRole {
  return AGENT_FAMILIES.has(family) ? "agent" : "evidence";
}

const FAMILY_LABEL: Record<CaptureSurfaceToolFamily, string> = {
  manual: "직접 입력",
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  git: "Git",
  ide: "에디터 / IDE",
  browser: "브라우저",
  terminal: "터미널",
  document: "문서 / 파일",
  analysis: "분석",
};

const AVAILABILITY_RANK: Record<ControlCenterAvailability, number> = {
  available: 0,
  needsSetup: 1,
  needsDesktopApp: 2,
  planned: 3,
  unavailable: 4,
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** True when a surface depends on Mori's desktop runtime. */
function requiresDesktop(row: CaptureSurfaceRow): boolean {
  return (
    row.captureMode === "localDesktopCommand" || row.captureMode === "browserNativeMessaging"
  );
}

function classifyAvailability(
  row: CaptureSurfaceRow,
  isDesktop: boolean,
): ControlCenterAvailability {
  switch (row.status) {
    case "implemented":
    case "partial":
    case "manualOnly":
      if (requiresDesktop(row) && !isDesktop) return "needsDesktopApp";
      return "available";
    case "docsTemplateOnly":
      return "needsSetup";
    case "planned":
      return "planned";
    case "unavailable":
      return "unavailable";
  }
}

/**
 * Map a capture surface to the Evidence import tab it feeds. Returns `null`
 * for surfaces that have no direct paste/import tab (planned connectors,
 * repository metadata).
 */
function resolveImportKind(
  id: CaptureSurfaceId,
): { kind: ControlCenterImportKind; platform?: ControlCenterAiPlatform } | null {
  switch (id) {
    case "manualNote":
      return { kind: "note" };
    case "urlImport":
      return { kind: "url" };
    case "aiTranscriptPaste":
      return { kind: "ai" };
    case "gitDiffPaste":
    case "tauriGitDiff":
      return { kind: "git" };
    // Local-capture surfaces emit connector JSONL; once set up the user
    // imports the result through the Connector JSONL tab.
    case "localCaptureBridge":
    case "claudeCodeHook":
    case "codexCliWrapper":
    case "openCodeCli":
      return { kind: "connector" };
    default:
      return null;
  }
}

const IMPORT_ACTION_LABEL: Partial<Record<CaptureSurfaceId, string>> = {
  manualNote: "메모 작성",
  urlImport: "URL 추가",
  aiTranscriptPaste: "AI 대화 붙여넣기",
  gitDiffPaste: "Git diff 가져오기",
  tauriGitDiff: "Git diff 가져오기",
  localCaptureBridge: "Connector JSONL 가져오기",
  claudeCodeHook: "Connector JSONL 가져오기",
  codexCliWrapper: "Connector JSONL 가져오기",
  openCodeCli: "Connector JSONL 가져오기",
};

const NO_SESSION_REASON =
  "실제 세션을 시작하면 가져올 수 있습니다.";
const DESKTOP_REASON =
  "Tauri 데스크톱 앱에서만 사용할 수 있습니다.";

function resolveAction(
  row: CaptureSurfaceRow,
  availability: ControlCenterAvailability,
  input: BuildControlCenterInput,
): ControlCenterAction {
  // Repository metadata is only a background convenience for Git diff capture.
  // The user-facing Git action is the import flow, where a path can be typed
  // or picked directly; Settings should not carry a separate repository setup.
  if (row.id === "repositoryMetadata") {
    return {
      kind: "none",
      label: "Git 가져오기에서 직접 입력",
      enabled: false,
    };
  }

  // Planned / unavailable surfaces never get an actionable import — they exist
  // so the user can inspect what each will and will not access.
  if (availability === "planned" || availability === "unavailable") {
    return {
      kind: "none",
      label: availability === "planned" ? "예정" : "사용 불가",
      enabled: false,
    };
  }

  const importTarget = resolveImportKind(row.id);
  if (!importTarget) {
    return { kind: "none", label: "—", enabled: false };
  }

  // A desktop-only import surface (e.g. the Tauri git-diff capture) stays
  // disabled in the browser, with an honest reason.
  if (availability === "needsDesktopApp") {
    return {
      kind: "evidenceImport",
      label: IMPORT_ACTION_LABEL[row.id] ?? "가져오기",
      enabled: false,
      disabledReason: DESKTOP_REASON,
      importKind: importTarget.kind,
      importPlatform: importTarget.platform,
    };
  }

  return {
    kind: "evidenceImport",
    label: IMPORT_ACTION_LABEL[row.id] ?? "가져오기",
    enabled: input.hasActiveSession,
    disabledReason: input.hasActiveSession ? undefined : NO_SESSION_REASON,
    importKind: importTarget.kind,
    importPlatform: importTarget.platform,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function toControlCenterSurface(
  row: CaptureSurfaceRow,
  input: BuildControlCenterInput,
): ControlCenterSurface {
  const availability = classifyAvailability(row, input.isDesktop);
  return {
    id: row.id,
    label: row.label,
    toolFamily: row.toolFamily,
    status: row.status,
    availability,
    statusDescription: describeCaptureSurfaceStatus(row),
    privacyBoundary: row.privacyBoundary,
    whatMoriCanAccess: row.whatMoriCanAccess,
    whatMoriNeverAccesses: row.whatMoriNeverAccesses,
    userActionRequired: row.userActionRequired,
    setupRequirement: row.setupRequirement,
    nextStep: row.nextStep,
    recommended: row.recommended ?? false,
    rawDataPolicy: row.rawDataPolicy,
    action: resolveAction(row, availability, input),
  };
}

/**
 * Build the Source Control Center view-model. Pure: same inputs always yield
 * the same grouped, classified output.
 */
export function buildConnectorControlCenter(
  input: BuildControlCenterInput,
): ConnectorControlCenterViewModel {
  const surfaces = getAllCaptureSurfaces()
    // Quick Pass is analysis, not a connectable source.
    .filter((row) => row.toolFamily !== "analysis")
    .map((row) => toControlCenterSurface(row, input));

  const familyIndex = new Map(FAMILY_ORDER.map((family, i) => [family, i]));
  const byFamily = new Map<CaptureSurfaceToolFamily, ControlCenterSurface[]>();
  for (const surface of surfaces) {
    const list = byFamily.get(surface.toolFamily) ?? [];
    list.push(surface);
    byFamily.set(surface.toolFamily, list);
  }

  const groups: ControlCenterGroup[] = Array.from(byFamily.entries())
    .sort((a, b) => {
      const ai = familyIndex.get(a[0]) ?? FAMILY_ORDER.length;
      const bi = familyIndex.get(b[0]) ?? FAMILY_ORDER.length;
      return ai - bi;
    })
    .map(([family, familySurfaces]) => ({
      family,
      label: FAMILY_LABEL[family],
      role: familyRole(family),
      surfaces: sortSurfaces(familySurfaces),
    }));

  return { groups, counts: countSurfaces(surfaces) };
}

/** Available first, then needs-setup / desktop, then planned — stable within a band. */
function sortSurfaces(surfaces: ControlCenterSurface[]): ControlCenterSurface[] {
  return [...surfaces].sort(
    (a, b) => AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability],
  );
}

function countSurfaces(surfaces: ControlCenterSurface[]): ControlCenterCounts {
  const counts: ControlCenterCounts = {
    available: 0,
    needsDesktopApp: 0,
    needsSetup: 0,
    planned: 0,
    unavailable: 0,
    total: surfaces.length,
  };
  for (const surface of surfaces) {
    counts[surface.availability] += 1;
  }
  return counts;
}

const AVAILABILITY_LABEL: Record<ControlCenterAvailability, string> = {
  available: "사용 가능",
  needsDesktopApp: "데스크톱 필요",
  needsSetup: "설정 필요",
  planned: "예정",
  unavailable: "사용 불가",
};

const AVAILABILITY_TONE: Record<ControlCenterAvailability, string> = {
  available: "green",
  needsDesktopApp: "blue",
  needsSetup: "orange",
  planned: "gray",
  unavailable: "gray",
};

export function describeControlCenterAvailability(
  availability: ControlCenterAvailability,
): { label: string; tone: string } {
  return { label: AVAILABILITY_LABEL[availability], tone: AVAILABILITY_TONE[availability] };
}

export type ControlCenterPartition = {
  /**
   * Sources the user can act on now or after a setup step — available,
   * needs-setup, or needs-desktop. Sorted available-first so the hub leads
   * with what works right now; ties broken by family order.
   */
  actionable: ControlCenterSurface[];
  /** Designed-but-unbuilt sources — reference only, no action. Family order. */
  planned: ControlCenterSurface[];
};

/**
 * Flatten the grouped view-model into an actionable list and a planned list.
 * The hub renders the actionable list as dense rows and folds the planned
 * catalogue into a disclosure, so a wall of inert "예정" cards never buries
 * the few sources the user can actually use.
 */
export function partitionControlCenterSurfaces(
  vm: ConnectorControlCenterViewModel,
): ControlCenterPartition {
  const familyRank = new Map(FAMILY_ORDER.map((family, index) => [family, index]));
  const flat = vm.groups.flatMap((group) => group.surfaces);
  const byFamily = (a: ControlCenterSurface, b: ControlCenterSurface) =>
    (familyRank.get(a.toolFamily) ?? FAMILY_ORDER.length) -
    (familyRank.get(b.toolFamily) ?? FAMILY_ORDER.length);
  const actionable = flat
    .filter(
      (surface) =>
        surface.availability === "available" ||
        surface.availability === "needsSetup" ||
        surface.availability === "needsDesktopApp",
    )
    .sort(
      (a, b) =>
        AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] || byFamily(a, b),
    );
  const planned = flat
    .filter(
      (surface) => surface.availability === "planned" || surface.availability === "unavailable",
    )
    .sort(byFamily);
  return { actionable, planned };
}
