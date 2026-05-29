import type {
  SourceWorkspaceCategory,
  SourceWorkspaceSource,
  SourceWorkspaceStatus,
  SourceWorkspaceViewModel,
} from "./sourceWorkspace";

/**
 * Provider grouping for the 소스 page.
 *
 * The flat source list (`buildSourceWorkspace`) answers "what can connect"
 * but scatters every Claude path (paste / hook / export) across the table and
 * repeats the same "붙여넣기" capability per platform. This pure helper folds
 * that list into **providers**: Claude / Codex / OpenCode anchor a session
 * (agents); ChatGPT and other pasted AI transcripts, plus Git / 터미널 / 메모 /
 * URL / 문서, attach as evidence, and
 * exposes each provider's individual *연결 방법* as sub-methods. Fully-planned
 * providers (Slack, Notion, MCP, …) collapse into a quiet chip list so a wall
 * of "예정" rows never buries the few that work today.
 *
 * The grouping mirrors the product model in docs/mori-project-goal.md: a Mori
 * session is one AI-agent conversation (the spine); everything else is evidence
 * attached to it.
 */

export type SourceProviderRole = "agent" | "evidence";

/** One concrete way to bring a provider's data in (paste / hook / export …). */
export type SourceProviderMethod = {
  /** The underlying source row; drives the action button and the inspector. */
  source: SourceWorkspaceSource;
  /** Short method title shown in the card, e.g. "Code 훅", "대화 붙여넣기". */
  methodLabel: string;
  /** Compact "연결 방법" chip, e.g. "붙여넣기", "CLI 래퍼", "로컬 훅". */
  connectLabel: string;
};

export type SourceProvider = {
  id: string;
  name: string;
  role: SourceProviderRole;
  /** Category of the leading method; used to pick the provider icon. */
  category: SourceWorkspaceCategory;
  /** Leading (most-available) status across the provider's methods. */
  status: SourceWorkspaceStatus;
  statusLabel: string;
  statusTone: string;
  /** True when any method is the recommended primary path (hook / wrapper). */
  recommended: boolean;
  methods: SourceProviderMethod[];
};

export type SourceProviderGroups = {
  /** Session anchors: Claude / Codex / OpenCode. */
  agents: SourceProvider[];
  /** Evidence attached to a session: ChatGPT 등 붙여넣은 트랜스크립트, Git / 터미널 / 메모 / URL / 문서 / 패키지. */
  evidence: SourceProvider[];
  /** Fully-planned providers, rendered as quiet chips. */
  planned: SourceProvider[];
};

type ProviderSpec = { id: string; name: string };

/**
 * Anchor agents: local agents a connector / hook can capture, so they can be a
 * session spine and carry the 기록에서 불러오기 way-in. This is the single rule
 * that decides agent vs evidence: a provider is an agent iff its id is here.
 * Everything else, including ChatGPT and any future pasted AI transcript,
 * attaches as evidence. Shared with the 소스 page so the page and the grouping
 * never disagree on what can anchor.
 */
export const ANCHOR_AGENT_IDS = new Set(["claude", "codex", "opencode"]);

function roleFor(providerId: string): SourceProviderRole {
  return ANCHOR_AGENT_IDS.has(providerId) ? "agent" : "evidence";
}

/**
 * Redundant rows that duplicate a per-provider method. `aiConversation` is the
 * generic "paste any AI conversation" registry entry, already covered by the
 * per-provider transcript pastes plus the universal `aiTranscriptPaste`.
 */
const DROP_IDS = new Set<string>(["aiConversation"]);

/**
 * Which provider each source row maps to. Role (agent vs evidence) is not stored
 * here, it is derived by `roleFor` from `ANCHOR_AGENT_IDS`, so the only agents
 * are the local anchors below.
 */
const PROVIDER_SPEC_BY_ID: Record<string, ProviderSpec> = {
  // ── Anchor agents ─────────────────────────────────────────────────────────
  claudeTranscript: { id: "claude", name: "Claude" },
  claudeCodeHook: { id: "claude", name: "Claude" },
  claudeDesktopExport: { id: "claude", name: "Claude" },
  claudeWebExport: { id: "claude", name: "Claude" },
  codexTranscript: { id: "codex", name: "Codex" },
  codexCliWrapper: { id: "codex", name: "Codex" },
  codexDesktopExport: { id: "codex", name: "Codex" },
  codexWebGithub: { id: "codex", name: "Codex" },
  openCodeCli: { id: "opencode", name: "OpenCode" },
  // The universal paste surface ("Claude / ChatGPT / Codex / Other") gives
  // OpenCode and any unlisted agent a paste path; the named anchors above
  // already carry their own transcript paste.
  aiTranscriptPaste: { id: "opencode", name: "OpenCode" },
  // ── Evidence ────────────────────────────────────────────────────────────
  // ChatGPT cannot anchor (no local capture, storage off-limits); it attaches
  // as a pasted transcript, like any future Gemini / other transcript would.
  chatgptTranscript: { id: "chatgpt", name: "ChatGPT" },
  connectorJsonl: { id: "connector", name: "Connector JSONL" },
  gitDiffPaste: { id: "git", name: "Git" },
  tauriGitDiff: { id: "git", name: "Git" },
  repositoryMetadata: { id: "git", name: "Git" },
  githubPrImport: { id: "git", name: "Git" },
  localCaptureBridge: { id: "terminal", name: "터미널" },
  terminalShellIntegration: { id: "terminal", name: "터미널" },
  manualNote: { id: "note", name: "메모" },
  urlImport: { id: "url", name: "URL" },
  fileDocumentImport: { id: "document", name: "문서 / 파일" },
  vscodeExtension: { id: "ide", name: "에디터 / IDE" },
  cursorExtension: { id: "ide", name: "에디터 / IDE" },
  browserExtension: { id: "browser", name: "브라우저" },
  mcpServer: { id: "mcp", name: "MCP" },
};

/** Per-method display copy. Falls back to the source name + a status chip. */
const METHOD_BY_ID: Record<string, { methodLabel: string; connectLabel: string }> = {
  claudeTranscript: { methodLabel: "대화 붙여넣기", connectLabel: "붙여넣기" },
  claudeCodeHook: { methodLabel: "Code 훅", connectLabel: "로컬 훅" },
  claudeDesktopExport: { methodLabel: "Desktop 내보내기", connectLabel: "내보내기" },
  claudeWebExport: { methodLabel: "Web 내보내기", connectLabel: "내보내기" },
  chatgptTranscript: { methodLabel: "대화 · export 붙여넣기", connectLabel: "붙여넣기" },
  codexTranscript: { methodLabel: "대화 붙여넣기", connectLabel: "붙여넣기" },
  codexCliWrapper: { methodLabel: "CLI 래퍼", connectLabel: "CLI 래퍼" },
  codexDesktopExport: { methodLabel: "Desktop 내보내기", connectLabel: "내보내기" },
  codexWebGithub: { methodLabel: "Web · GitHub", connectLabel: "내보내기" },
  openCodeCli: { methodLabel: "CLI 래퍼", connectLabel: "CLI 래퍼" },
  aiTranscriptPaste: { methodLabel: "대화 붙여넣기", connectLabel: "붙여넣기" },
  connectorJsonl: { methodLabel: "JSONL 가져오기", connectLabel: "JSONL" },
  gitDiffPaste: { methodLabel: "diff 붙여넣기", connectLabel: "붙여넣기" },
  tauriGitDiff: { methodLabel: "diff 캡처", connectLabel: "데스크톱" },
  repositoryMetadata: { methodLabel: "리포지토리 설정", connectLabel: "설정" },
  githubPrImport: { methodLabel: "PR · 커밋 가져오기", connectLabel: "예정" },
  localCaptureBridge: { methodLabel: "CLI 브릿지", connectLabel: "로컬 캡처" },
  terminalShellIntegration: { methodLabel: "셸 통합", connectLabel: "예정" },
  manualNote: { methodLabel: "메모 작성", connectLabel: "직접 입력" },
  urlImport: { methodLabel: "URL 추가", connectLabel: "직접 입력" },
  fileDocumentImport: { methodLabel: "파일 가져오기", connectLabel: "예정" },
  vscodeExtension: { methodLabel: "VS Code 확장", connectLabel: "예정" },
  cursorExtension: { methodLabel: "Cursor 확장", connectLabel: "예정" },
  browserExtension: { methodLabel: "브라우저 확장", connectLabel: "예정" },
  mcpServer: { methodLabel: "MCP 서버", connectLabel: "예정" },
};

const STATUS_RANK: Record<SourceWorkspaceStatus, number> = {
  available: 0,
  needsSetup: 1,
  needsDesktopApp: 2,
  planned: 3,
  unsupported: 4,
};

const AGENT_ORDER = ["claude", "codex", "opencode"];
const EVIDENCE_ORDER = ["git", "terminal", "connector", "note", "url", "chatgpt", "document"];

function specFor(source: SourceWorkspaceSource): ProviderSpec {
  const known = PROVIDER_SPEC_BY_ID[source.id];
  if (known) return known;
  // Unlisted rows (future integrations like Slack / Notion / Figma) become
  // their own single-method provider. Role is decided by roleFor at build time,
  // so an unlisted source anchors only if its id is an ANCHOR_AGENT_IDS member.
  return {
    id: source.id,
    name: source.name,
  };
}

function methodFor(source: SourceWorkspaceSource): {
  methodLabel: string;
  connectLabel: string;
} {
  const known = METHOD_BY_ID[source.id];
  if (known) return known;
  const planned = source.status === "planned" || source.status === "unsupported";
  return { methodLabel: source.name, connectLabel: planned ? "예정" : "가져오기" };
}

function isPlanned(status: SourceWorkspaceStatus): boolean {
  return status === "planned" || status === "unsupported";
}

function orderByList(order: string[]) {
  return (a: SourceProvider, b: SourceProvider): number => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    const ar = ai === -1 ? order.length : ai;
    const br = bi === -1 ? order.length : bi;
    return ar - br || a.name.localeCompare(b.name);
  };
}

/**
 * Fold a source workspace view-model into provider groups. Pure: identical
 * inputs always yield identical grouped output.
 */
export function buildSourceProviderGroups(
  vm: SourceWorkspaceViewModel,
): SourceProviderGroups {
  const byProvider = new Map<
    string,
    { spec: ProviderSpec; methods: SourceProviderMethod[] }
  >();

  for (const source of vm.sources) {
    if (DROP_IDS.has(source.id)) continue;
    const spec = specFor(source);
    const { methodLabel, connectLabel } = methodFor(source);
    const entry = byProvider.get(spec.id) ?? { spec, methods: [] };
    entry.methods.push({ source, methodLabel, connectLabel });
    byProvider.set(spec.id, entry);
  }

  const providers: SourceProvider[] = [];
  for (const { spec, methods } of byProvider.values()) {
    const sorted = [...methods].sort(
      (a, b) => STATUS_RANK[a.source.status] - STATUS_RANK[b.source.status],
    );
    const lead = sorted[0]!.source;
    providers.push({
      id: spec.id,
      name: spec.name,
      role: roleFor(spec.id),
      category: lead.category,
      status: lead.status,
      statusLabel: lead.statusLabel,
      statusTone: lead.statusTone,
      recommended: sorted.some((method) => method.source.recommended),
      methods: sorted,
    });
  }

  const agents = providers
    .filter((provider) => !isPlanned(provider.status) && provider.role === "agent")
    .sort(orderByList(AGENT_ORDER));
  const evidence = providers
    .filter((provider) => !isPlanned(provider.status) && provider.role === "evidence")
    .sort(orderByList(EVIDENCE_ORDER));
  const planned = providers
    .filter((provider) => isPlanned(provider.status))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { agents, evidence, planned };
}
