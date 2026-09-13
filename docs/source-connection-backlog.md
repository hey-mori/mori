# Mori Source Connection Backlog

This backlog is the product contract behind the top-level **소스** workspace.
It classifies what Mori can safely acquire today, what is partially wired,
what is UI-only or planned, and what must stay forbidden.

Principle: Mori is local-first. Every acquisition path is explicit, local,
and review-before-apply unless the item is a user-authored note or URL
reference. Mori does not scrape accounts, app databases, browser history,
terminal scrollback, editor buffers, or hidden folders. The one approved
database-shaped exception is Cursor composer chat: user-invoked, read-only,
`composerData:*` rows only, and still review-before-apply.

## Capability Audit

| Source | Status | Safe acquisition method | Expected input | Parser / adapter | Normalized output | User action | Privacy / safety note | Review behavior | Likely files | Tests needed | Safe now |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude transcript paste | Real and usable | Pasted transcript | Plain text transcript | `normalizeAiTranscript` | `claudeTranscript` source + timeline events | AI 대화 붙여넣기 | No Claude account/API access | Import Review before Timeline | `src/lib/import/normalizeAiTranscript.ts` | Parser + review handoff | Yes |
| Claude Code hook | Partially implemented | Local hook JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install hook, import JSONL | No hidden capture; user imports file | Import Review before Timeline | `connectors/claude-code/`, `src/lib/connectors/` | Fixture round-trip + guide copy | Yes |
| Codex transcript paste | Real and usable via AI tab | Pasted transcript | Plain text transcript | `normalizeAiTranscript` | `codexTranscript` source + timeline events | AI 대화 붙여넣기 | No Codex account/API access | Import Review before Timeline | `src/lib/import/normalizeAiTranscript.ts` | Platform mapping | Yes |
| Codex CLI wrapper | Partially implemented | Local wrapper JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install wrapper, import JSONL | Captures metadata only by explicit command | Import Review before Timeline | `connectors/codex-cli/` | Fixture round-trip + no secret capture | Yes |
| OpenCode CLI wrapper | Partially implemented | Local wrapper JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install wrapper, import JSONL | No account/API capture | Import Review before Timeline | `connectors/opencode-cli/` | Fixture round-trip | Yes |
| Cursor composer sessions | Real and usable in Tauri | User-invoked local session discovery | Cursor `state.vscdb` composer rows | Cursor session adapter | `cursorTranscript` source + timeline events | Click 기록에서 불러오기 / select session | Read-only `composerData:*` chat rows only; no editor buffers, account, watcher, or arbitrary app data | Import Review before Timeline | `src-tauri/src/cursor/sessions.rs`, `src/lib/trace/sources/ai/workSessions.ts` | Cursor fixture + privacy invariant | Yes |
| ChatGPT export import | Real and usable | Pasted export JSON or transcript | `conversations.json` content / text | `parseChatGptExport`, `normalizeAiTranscript` | `chatgptTranscript` source + events | Paste exported JSON/text | User-selected export only | Import Review before Timeline | `src/lib/import/parseChatGptExport.ts` | Export parser + fallback text parser | Yes |
| Git diff paste | Real and usable | Pasted diff | Unified diff | `normalizeGitDiff` | `gitDiff` source + file events | Paste diff | Reads only pasted text | Import Review before Timeline | `src/lib/import/normalizeGitDiff.ts` | Diff parser + file stats | Yes |
| Git diff desktop command | Real and usable in Tauri | User-added repo path + range | Repo path, range, staged flag | Tauri git command + diff normalizer | `tauriGitDiff` source + events | Click fetch | Runs only on selected repo path | Import Review before Timeline | `src-tauri/src/git/diff.rs` | Command + path boundary | Yes |
| Repository metadata | Real and usable in Tauri | User-added path verify | Repo path | Tauri verify command | Path metadata only | Settings → Repositories | No file content read | Not a source; no memory write | `src/app/repositoryStore.ts` | Verification freshness | Yes |
| Terminal log | Partially implemented | Explicit saved log / helper output | Connector JSONL or transcript | local-capture / connector pipeline | `terminal` / connector events | Run helper or import saved log | No shell history or scrollback scan | Import Review before Timeline | `connectors/terminal-helper/` | No hidden history invariant | Yes for helper |
| Manual note | Real and usable | Direct entry / markdown | Text | `normalizeManualNote` | `manualNote` source + event | Write note | User-authored only | Direct source apply today | `src/lib/import/normalizeManualNote.ts` | Normalizer + direct apply | Yes |
| URL reference | Real and usable | User-pasted URL + excerpt | URL and optional text | `normalizeUrlSource` | `url` source + event | URL 추가 | No browser fetch/history | Direct source apply today | `src/lib/import/normalizeUrl.ts` | URL validation | Yes |
| `.mori` package import/export | Real for memory packages | User-selected `.mori` zip/JSON | `.mori` package | `src/lib/mori-package/` | memory proposals / package records | Import/export package | Explicit file only | Consolidation review before memory | `src/lib/mori-package/` | Package validation + client-safe export | Yes |
| Connector JSONL import | Real and usable | Paste or Tauri inbox file selection | JSONL lines | connector JSONL pipeline | source package + events + reimport summary | JSONL 불러오기 | No inbox watcher, no polling | Import Review before Timeline | `src/lib/connectors/`, `ImportPanel` | Duplicate history + preview | Yes |
| AI transcript import | Real and usable | Pasted transcript/export | Text or ChatGPT JSON | AI transcript normalizers | AI source + events | AI 대화 붙여넣기 | No account scraping | Import Review before Timeline | `src/lib/import/` | Role parser + fidelity | Yes |
| Project-local capture scripts | Partially implemented | User-installed scripts/tasks | JSONL package | local-capture bridge | connector events | Run script/task explicitly | No daemon/watcher | Import Review before Timeline | `connectors/local-capture/`, `connectors/vscode-task/` | Template round-trip | Yes |
| Source adapter registry | Partial | Registry/view-model only | Capture surface rows | `captureSurfaces`, `sourceWorkspace`, `sourceProviderGroups` | UI status/action model + provider groups | Inspect source page | No fake connected states | N/A | `src/lib/connectors/`, `src/lib/sources/` | Status/action invariants + provider grouping | Yes |
| Session/work-unit preview | Partial | Import Review / Work Bundle preview | normalized candidates | review/work-bundle helpers | candidate events and sources | Preview then apply | No durable memory write | Review-before-apply | `src/features/import/`, `src/lib/import/workBundle.ts` | Preview counts + dedupe | Yes |
| IDE/editor activity | Planned | Explicit task/extension action | JSONL digest | future adapter | editor source + events | User triggers capture | No keylogging/buffer polling | Import Review before Timeline | `connectors/vscode-task/` | Permission model | Not yet |
| Figma / Linear / Jira / Slack / Notion | Planned | Explicit export/import only | JSON/Markdown/export | future parsers | source/events/review candidates | User imports export | No OAuth/cloud sync unless approved | Review-before-apply | `src/lib/sources/sourceRegistry.ts` | Parser + privacy tests | Not yet |

## Forbidden / Unsafe

- Claude Desktop database scraping
- ChatGPT browser scraping
- Cursor internal database scraping, except the approved composer-chat
  path: user-invoked, read-only, `composerData:*` rows only, and still
  review-before-apply
- browser history scraping
- terminal scrollback or shell-history scraping
- hidden folder monitoring
- hidden clipboard capture
- account OAuth / cloud sync without explicit approval
- automatic project-memory writes without review

## Direction · source classification and session model (2026-05)

This section is the governing intent the presentation contract below follows
from. It refines, and is consistent with,
[`design/mori-redesign-session-centric.md`](design/mori-redesign-session-centric.md)
and [`mori-project-goal.md`](mori-project-goal.md) §1. Update it when a
decision actually changes.

### What 소스 is for

The 소스 workspace is **data-inspection-first**. It answers "what can each
source give me, what does Mori read and not read, and what is the canonical
structure of that data" before it answers "start importing". Configuration
lives here too (including developer-facing structure verification while the
service is being built, some of which may never ship to end users). Its centre
of gravity is *understand and verify the data*, not *manually compose a
session*. Session creation lives in the session flow; 소스 links into that flow
rather than hosting it.

### Classification axis · capture capability, not "agent vs evidence"

The honest axis is whether Mori can capture and associate a source's work,
not whether it is "an AI". Three kinds:

1. **Anchorable agents** · local agents a connector / hook can capture, so they
   can be a session **spine**: **Claude · Codex · OpenCode**. These, and only
   these, appear in the 새 세션 agent picker.
2. **Pasted AI transcripts** · no local capture is possible, so they are
   hand-imported text and behave as **evidence, not anchors**: ChatGPT export,
   Gemini, any pasted conversation. Generalize these to one "pasted AI
   transcript" source rather than presenting each as a peer agent.
3. **Auto-associated evidence** · Git diffs, terminal runs, files, and URLs the
   agent touched while doing the work. Captured by an explicit connector, then
   **auto-associated** onto the matching session spine.

### ChatGPT is a transcript source, not a peer agent

ChatGPT cannot anchor a session: you do not run it locally as a coding agent,
and reading its storage is a forbidden non-goal. It is "a pasted AI
transcript". The 소스 page must not present it as an equal anchor beside
Claude / Codex / OpenCode, because that invites the false expectation that you
can start a session from it.

### Extensibility · adapter to canonical, not core rules or auto-sniffing

Agent conversation structures, file formats, and folder locations vary per
user and environment and drift over time. Two tempting approaches both fail:
hard-coding per-agent rules in the core (brittle when a format changes) and
auto-detecting arbitrary structures (unreliable guessing). The robust path,
already Mori's connector model, is to push volatility to the **edge adapter**
(connector / hook), which translates the native shape into the canonical
Connector JSONL the core consumes. A new agent or a changed format is a new or
updated adapter; the core is untouched. Paste parsers are a best-effort
fallback, never the main path.

### Evidence is auto-associated, not user-assembled

Per [`mori-project-goal.md`](mori-project-goal.md) §1: **capture is explicit**
(a connector ran), **association is automatic** (Mori groups already-captured
evidence onto the session spine). Hand-adding Git / terminal / URL into a
session by hand (the Work Bundle path) is the rare manual fallback, not the
model. Mori never watches the agent; it only associates what an explicit
connector already captured. The current manual evidence-import drawer is the
surface that diverges from this and should be demoted toward the
auto-association model over time.

### Consequences and open items

- **Fixed:** "기록에서 불러오기" is an anchor-agent capability tied to local
  work-record detection, which today covers all three anchor agents (Claude via
  Claude Code discovery, Codex via Codex CLI discovery, OpenCode via the
  connector inbox · see `src/lib/trace/sources/ai/workSessions.ts`). It must never appear
  on a pasted transcript source like ChatGPT, which has no local records and
  whose storage Mori is forbidden to read. The inspector now gates this entry on
  `ANCHOR_AGENT_IDS` (claude / codex / opencode), not on the broad
  `category === "AI"` test that wrongly included ChatGPT and excluded
  Codex / OpenCode. (The "Claude-today" note in
  [`mori-project-goal.md`](mori-project-goal.md) §4 is stale and should be
  refreshed to "anchor agents".)
- **Fixed:** the inspector presents every way-in coherently. 기록에서 불러오기
  is the first 연결 방법 entry for an anchor agent and the canonical default
  selection; selecting any method drives a single contextual action button. The
  earlier split, passive method labels above an orphan 기록에서 불러오기 button
  stacked over the import action, is gone.
- **Fixed:** ChatGPT moved out of the 에이전트 group into 자료. The agent vs
  evidence split is now one rule, `roleFor` over `ANCHOR_AGENT_IDS` in
  `sourceProviderGroups`: a provider is an agent iff its id is an anchor
  (claude / codex / opencode), so ChatGPT and any future pasted AI transcript
  (Gemini, other) classify as evidence automatically, with no per-id role table
  to keep in sync. The 소스 에이전트 list now matches the 새 세션 agent picker
  exactly.

## 소스 Page Presentation Contract

The 소스 workspace (the `connections` route, rendered by
`src/features/sources/SourcesView.tsx`) is a calm **provider overview**, not a
list or table of import methods. It answers one question at a glance: which
provider can I bring work from. All depth lives in the right inspector for the
selected provider.

### Layout model

- **Canvas = provider tiles.** One compact tile per provider (icon + name,
  nothing else). Grouped into two role sections plus a planned row:
  - **에이전트** · session anchors: Claude, Codex, OpenCode.
  - **자료** · evidence attached to a session: Git, 터미널, Connector JSONL,
    메모, URL, plus ChatGPT and any other pasted AI transcript (it cannot anchor,
    so it is evidence, not an agent).
  - **예정** · fully-planned providers (Slack, Notion, Figma, Jira, Linear,
    MCP, IDE, 브라우저, 문서, build / deploy log) as quiet chips.
- **Inspector = the selected provider's detail.** Selecting a tile shows that
  provider's 연결 방법 (its individual import methods, each with a status chip
  and the primary action), then 읽는 것 / 읽지 않는 것 / 지원 형식, and the
  import / setup action. Choosing a method in the picker swaps the detail
  shown below it.
- **Headerless.** The sidebar already names the destination, so the page has no
  title band; the ActionBar carries controls only (the shared search field).

### Grouping data

- Provider grouping is a pure, tested derivation: `buildSourceProviderGroups`
  (`src/lib/sources/sourceProviderGroups.ts`) folds the flat
  `buildSourceWorkspace` source list into `{ agents, evidence, planned }`
  provider groups, drops redundant rows (e.g. the generic `aiConversation`
  entry), and routes the universal paste surface under OpenCode. Agent
  families anchor; every other family is evidence; a provider whose methods are
  all planned collapses into the planned bucket.

### UI terminology

- Sections are **에이전트 / 자료 / 예정**. "자료" is the user-facing label for
  evidence sources; the internal model still calls them evidence.
- Inspector access labels drop the "Mori가" prefix: **읽는 것 / 읽지 않는 것**.
- Retire the old jargon columns (가족, 획득 방식, 데이터 범위). Provider grouping
  replaces "가족"; "연결 방법" replaces "획득 방식".

### Do

- Keep the canvas at the **provider level**. Push method-level detail, access
  lists, and actions into the inspector.
- Reuse the shared search component (`ToolbarSearch` / `SearchField`, the
  `mori-search-field` shell) that other pages use. Search filters providers by
  name / method / format; it is the only slice the page offers.
- Reuse the shared layout primitives (`PageShell`, `ActionBar`, `Badge`,
  `Button`) and the `--mori-*` tokens. Status uses semantic tones; purple is
  accent / selection only.
- Show a status chip on a method only when it needs attention (설정 필요 /
  예정 / 데스크톱 필요). An available method reads as ready by the absence of a
  chip.

### Don't

- Don't render import methods as a flat list, a grouped list, or a table of
  rows on the canvas. Each was tried and rejected: it repeats providers,
  inflates the page, and reads as clutter instead of an overview.
- Don't surface developer / internal data in the user-facing UI (source file
  paths, backlog ids, implementation notes). Those belong in this doc, never in
  the inspector.
- Don't add a status-filter control, a count strip, or a page title band to the
  overview.
- Don't give each provider its own bordered section with an inline method list.
  Providers are tiles; their methods live in the inspector.
- Don't reinvent a per-page search input or bolt custom styling onto it.

### Key files

- `src/features/sources/SourcesView.tsx` · the page (tiles + inspector).
- `src/lib/sources/sourceProviderGroups.ts` (+ `.test.ts`) · provider grouping.
- `src/lib/sources/sourceWorkspace.ts` · the flat source view-model it builds on.
- `src/lib/connectors/connectorControlCenter.ts` · agent vs evidence role and
  runtime availability.
