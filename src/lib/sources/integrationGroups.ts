import {
  getIntegrationsByStatus,
  type SourceIntegration,
} from "./sourceRegistry";

/**
 * Evidence Hub displays a curated subset of the registry.
 *
 * Some integrations are real but are not directly user-importable from the
 * Evidence Hub:
 *
 * - `repository` only stores saved repo paths; it has no "Add Repository"
 *   import action of its own (Git diff is the user-facing entry point).
 * - `quickPass` is an analysis pass, not an evidence source.
 * - `tauriGitDiff` is the desktop runtime variant of Git diff and shares the
 *   same card as the pasted Git diff flow.
 * - `antigravityTranscript` / `opencodeTranscript` are the source kinds carried
 *   by auto-detected Antigravity / OpenCode sessions (so an imported session
 *   reads as "Antigravity" / "OpenCode" in the source detail rather than the
 *   generic "AI 대화"). They are not standalone Hub paste cards: those agents
 *   arrive through 기록에서 불러오기, and the universal AI-conversation card
 *   already covers a manual paste fallback.
 *
 * We hide those internal entries from the Hub but still respect them inside
 * the source detail panel, where any source kind can be displayed.
 */
const HUB_HIDDEN_INTEGRATION_IDS = new Set([
  "repository",
  "quickPass",
  "tauriGitDiff",
  "antigravityTranscript",
  "opencodeTranscript",
]);

/**
 * Stable hub order for the "Available now" row.
 *
 * The first matching entry wins; missing IDs fall through to registry order.
 */
const AVAILABLE_HUB_ORDER: string[] = [
  "claudeTranscript",
  "chatgptTranscript",
  "codexTranscript",
  "aiConversation",
  "gitDiff",
  "connectorJsonl",
  "manualNote",
  "url",
];

/**
 * Stable hub order for the "Planned connectors" row.
 */
const PLANNED_HUB_ORDER: string[] = [
  "vscode",
  "cursor",
  "terminal",
  "browserTab",
  "slack",
  "notion",
  "figma",
  "fileSystem",
  "editor",
  "docs",
];

/**
 * Implemented + partial integrations that should appear as Evidence Hub
 * "Available now" cards. Items hidden by `HUB_HIDDEN_INTEGRATION_IDS` are
 * filtered out so the Hub never advertises non-user-facing internals.
 */
export function getHubAvailableIntegrations(): SourceIntegration[] {
  const implemented = getIntegrationsByStatus("implemented");
  const partial = getIntegrationsByStatus("partial");
  const hubFacing = [...implemented, ...partial].filter(
    (integration) => !HUB_HIDDEN_INTEGRATION_IDS.has(integration.id),
  );
  return sortByHubOrder(hubFacing, AVAILABLE_HUB_ORDER);
}

/**
 * Planned integrations surfaced in the Hub. We do not invent connectors that
 * are not in the registry — every card must map back to a registry entry, so
 * planned cards remain honest about what Mori will and will not do.
 */
export function getHubPlannedIntegrations(): SourceIntegration[] {
  const planned = getIntegrationsByStatus("planned");
  const hubFacing = planned.filter(
    (integration) => !HUB_HIDDEN_INTEGRATION_IDS.has(integration.id),
  );
  return sortByHubOrder(hubFacing, PLANNED_HUB_ORDER);
}

/**
 * Evidence Hub maps each available integration to a single import kind in the
 * existing ImportPanel. This keeps the Hub UI declarative and avoids hard
 * coupling between layout and import internals.
 */
export type HubImportKind = "note" | "url" | "ai" | "git" | "connector";

export function getHubImportKind(integrationId: string): HubImportKind | null {
  switch (integrationId) {
    case "manualNote":
      return "note";
    case "url":
      return "url";
    case "claudeTranscript":
    case "chatgptTranscript":
    case "codexTranscript":
    case "aiConversation":
      return "ai";
    case "gitDiff":
    case "tauriGitDiff":
      return "git";
    case "connectorJsonl":
      return "connector";
    default:
      return null;
  }
}

/**
 * AI transcript cards include a platform hint so clicking "Claude Transcript"
 * can preselect Claude in the import form.
 */
export type HubAiPlatform = "claude" | "chatgpt" | "codex" | "other";

export function getHubAiPlatform(integrationId: string): HubAiPlatform | null {
  switch (integrationId) {
    case "claudeTranscript":
      return "claude";
    case "chatgptTranscript":
      return "chatgpt";
    case "codexTranscript":
      return "codex";
    case "aiConversation":
      return "other";
    default:
      return null;
  }
}

/**
 * Where a hub card's primary action sends the user: which import surface
 * opens, plus the platform hint for AI transcripts. Returns `null` when the
 * integration is not importable yet (planned connectors), so callers can
 * keep the action inert without re-deriving the rule.
 */
export type ImportLaunchTarget = {
  kind: HubImportKind;
  platform: HubAiPlatform | null;
};

export function resolveImportLaunch(integrationId: string): ImportLaunchTarget | null {
  const kind = getHubImportKind(integrationId);
  if (!kind) return null;
  return { kind, platform: getHubAiPlatform(integrationId) };
}

/**
 * Single source of truth for the primary action label on a hub card. We keep
 * this here (not in the component) so tests can assert label policy without
 * rendering React.
 */
export function getHubCardActionLabel(integration: SourceIntegration): string {
  if (integration.status === "implemented") {
    if (integration.id === "manualNote") return "메모 작성";
    if (integration.id === "url") return "URL 추가";
    if (integration.id === "gitDiff" || integration.id === "tauriGitDiff") return "Git diff 가져오기";
    if (
      integration.id === "claudeTranscript" ||
      integration.id === "chatgptTranscript" ||
      integration.id === "codexTranscript" ||
      integration.id === "aiConversation"
    ) {
      return "AI 대화 붙여넣기";
    }
    return "추가";
  }
  if (integration.status === "partial") return "부분 구현 · 사용 가능";
  return "예정";
}

function sortByHubOrder(
  integrations: SourceIntegration[],
  order: string[],
): SourceIntegration[] {
  const index = new Map(order.map((id, i) => [id, i]));
  const sortable = [...integrations];
  sortable.sort((a, b) => {
    const ai = index.has(a.id) ? (index.get(a.id) as number) : order.length + 1;
    const bi = index.has(b.id) ? (index.get(b.id) as number) : order.length + 1;
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });
  return sortable;
}
