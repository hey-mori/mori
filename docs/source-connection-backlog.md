# Mori Source Connection Backlog

This backlog is the product contract behind the top-level **소스** workspace.
It classifies what Mori can safely acquire today, what is partially wired,
what is UI-only or planned, and what must stay forbidden.

Principle: Mori is local-first. Every acquisition path is explicit, local,
and review-before-apply unless the item is a user-authored note or URL
reference. Mori does not scrape accounts, app databases, browser history,
terminal scrollback, editor buffers, or hidden folders.

## Capability Audit

| Source | Status | Safe acquisition method | Expected input | Parser / adapter | Normalized output | User action | Privacy / safety note | Review behavior | Likely files | Tests needed | Safe now |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude transcript paste | Real and usable | Pasted transcript | Plain text transcript | `normalizeAiTranscript` | `claudeTranscript` source + timeline events | AI 대화 붙여넣기 | No Claude account/API access | Import Review before Timeline | `src/lib/import/normalizeAiTranscript.ts` | Parser + review handoff | Yes |
| Claude Code hook | Partially implemented | Local hook JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install hook, import JSONL | No hidden capture; user imports file | Import Review before Timeline | `connectors/claude-code/`, `src/lib/connectors/` | Fixture round-trip + guide copy | Yes |
| Codex transcript paste | Real and usable via AI tab | Pasted transcript | Plain text transcript | `normalizeAiTranscript` | `codexTranscript` source + timeline events | AI 대화 붙여넣기 | No Codex account/API access | Import Review before Timeline | `src/lib/import/normalizeAiTranscript.ts` | Platform mapping | Yes |
| Codex CLI wrapper | Partially implemented | Local wrapper JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install wrapper, import JSONL | Captures metadata only by explicit command | Import Review before Timeline | `connectors/codex-cli/` | Fixture round-trip + no secret capture | Yes |
| OpenCode CLI wrapper | Partially implemented | Local wrapper JSONL package | Connector JSONL | connector JSONL pipeline | connector source + events | Install wrapper, import JSONL | No account/API capture | Import Review before Timeline | `connectors/opencode-cli/` | Fixture round-trip | Yes |
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
| Source adapter registry | Partial | Registry/view-model only | Capture surface rows | `captureSurfaces`, `sourceWorkspace` | UI status/action model | Inspect source page | No fake connected states | N/A | `src/lib/connectors/`, `src/lib/sources/` | Status/action invariants | Yes |
| Session/work-unit preview | Partial | Import Review / Work Bundle preview | normalized candidates | review/work-bundle helpers | candidate events and sources | Preview then apply | No durable memory write | Review-before-apply | `src/features/import/`, `src/lib/import/workBundle.ts` | Preview counts + dedupe | Yes |
| IDE/editor activity | Planned | Explicit task/extension action | JSONL digest | future adapter | editor source + events | User triggers capture | No keylogging/buffer polling | Import Review before Timeline | `connectors/vscode-task/` | Permission model | Not yet |
| Figma / Linear / Jira / Slack / Notion | Planned | Explicit export/import only | JSON/Markdown/export | future parsers | source/events/review candidates | User imports export | No OAuth/cloud sync unless approved | Review-before-apply | `src/lib/sources/sourceRegistry.ts` | Parser + privacy tests | Not yet |

## Forbidden / Unsafe

- Claude Desktop database scraping
- ChatGPT browser scraping
- Cursor internal database scraping
- browser history scraping
- terminal scrollback or shell-history scraping
- hidden folder monitoring
- hidden clipboard capture
- account OAuth / cloud sync without explicit approval
- automatic project-memory writes without review

