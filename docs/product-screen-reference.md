# Mori Product Screen Reference

> The AI-generated reference images this document pointed to were removed on 2026-11-03. See [docs/assets/screenshots/README.md](assets/screenshots/README.md) for why and where to find them in history.

These references were AI-generated concept images, not screenshots of Mori. They are not all implemented. They define the intended product direction, information architecture, layout patterns, and future implementation milestones.

## Status Legend

- **Implemented**: Current app behavior substantially matches the reference and is wired to real data.
- **Partial**: A screen or foundation exists, but the visible product does not fully match the reference.
- **Planned**: Product direction is defined, but the screen/behavior is not implemented yet.
- **Reference only**: Planning image or overview, not an app screen.

## Screen Index

| Screen | Status | Reference (removed) | Prompt/spec |
| --- | --- | --- | --- |
| [Start Session / Session Setup](#start-session-session-setup) | Implemented · agent-first reframe (diverged from reference image) | `start-session-reference.png` | [product-screen-prompts.md](product-screen-prompts.md) |
| [Evidence Hub](#evidence-hub) | Implemented | `evidence-hub-reference.png` | [product-screen-prompts.md#1-evidence-hub](product-screen-prompts.md#1-evidence-hub) |
| [AI Transcript Import](#ai-transcript-import) | Partial | `ai-transcript-import-reference.png` | [product-screen-prompts.md#2-ai-transcript-import](product-screen-prompts.md#2-ai-transcript-import) |
| [Git Diff Import](#git-diff-import) | Partial | `git-diff-import-reference.png` | [product-screen-prompts.md#3-git-diff-import](product-screen-prompts.md#3-git-diff-import) |
| [Import Review / Evidence Mapping](#import-review-evidence-mapping) | Partial | `import-review-evidence-mapping-reference.png` | [product-screen-prompts.md#4-import-review--evidence-mapping](product-screen-prompts.md#4-import-review--evidence-mapping) |
| [Narrative Timeline](#narrative-timeline) | Partial | `narrative-timeline-reference.png` | [product-screen-prompts.md#5-narrative-timeline](product-screen-prompts.md#5-narrative-timeline) |
| [Flow Focus / Trace View](#flow-focus-trace-view) | Partial | `flow-focus-trace-view-reference.png` | [product-screen-prompts.md#6-flow-focus--trace-view](product-screen-prompts.md#6-flow-focus--trace-view) |
| [Review](#review) | Implemented | `review-reference.png` | [product-screen-prompts.md#7-review](product-screen-prompts.md#7-review) |
| [Resume & Reports](#resume-reports) | Implemented | `resume-reports-reference.png` | [product-screen-prompts.md#8-resume--reports](product-screen-prompts.md#8-resume--reports) |
| [End Session / Session Summary](#end-session-session-summary) | Planned | `end-session-summary-reference.png` | [product-screen-prompts.md#9-end-session--session-summary](product-screen-prompts.md#9-end-session--session-summary) |
| [Project Memory](#project-memory) | Partial · cross-session aggregation Planned | `project-memory-reference.png` | [product-screen-prompts.md#10-project-memory](product-screen-prompts.md#10-project-memory) |
| [Settings / Privacy / Local AI](#settings-privacy-local-ai) | Implemented | `settings-privacy-local-ai-reference.png` | [product-screen-prompts.md#11-settings--privacy--local-ai](product-screen-prompts.md#11-settings--privacy--local-ai) |
| [Connector Setup](#connector-setup) | Planned | `connector-setup-reference.png` | [product-screen-prompts.md#12-connector-setup](product-screen-prompts.md#12-connector-setup) |
| [Edit Event / Correction Panel](#edit-event-correction-panel) | Planned | `edit-event-correction-panel-reference.png` | [product-screen-prompts.md#13-edit-event--correction-panel](product-screen-prompts.md#13-edit-event--correction-panel) |
| [Product Overview / Screen Map](#product-overview-screen-map) | Reference only | `product-overview-screen-map-reference.png` | [product-screen-prompts.md#14-product-overview--screen-map](product-screen-prompts.md#14-product-overview--screen-map) |

## Reference Screens

<a id="start-session-session-setup"></a>

### Start Session / Session Setup

> The reference image predates the **agent-first reframe**. The live screen no
> longer uses the source-tile grid / recording-mode cards / honesty strip shown
> in the image; treat the bullets below as the current source of truth.

- **Status:** Implemented. A real, wired creation flow, agent-first, with every section visible on one page (no step-by-step wizard, no navigation away to import).
- **Product purpose:** Establish one AI-agent work conversation as the session spine before any evidence accumulates ("one conversation = one session").
- **Primary user job:** Pick the agent, choose how its conversation enters Mori, then create the session.
- **Information architecture (current):** three numbered blocks on one page:
  1. **에이전트**: Claude / Codex / OpenCode. Agent-first because the roster is the thing that grows and it decides which import methods are possible.
  2. **대화**, how the conversation arrives: **기록에서 불러오기** (auto-detected agent work records; opens the 작업 대화 둘러보기 modal), **붙여넣기** (paste a transcript; the platform follows the chosen agent), or **빈 세션으로 시작** (anchor first; Mori never drives the agent).
  3. **세션 정보**: project (a styled `MoriSelect` dropdown: existing projects + 새 프로젝트) and session name (auto-filled from a detected / pasted conversation, editable otherwise).
- **기록에서 불러오기 modal (`DetectedConversationsModal`):** two panes, a searchable, recency-sorted, project-grouped list (left) and a content preview (right: opening request, first turns, message / code-block counts, time window, model), loaded on demand. Detection is desktop-only and real for Claude today; Codex / OpenCode show **곧** (planned), and in the browser the list states the desktop requirement instead of faking data.
- **Retention:** one unified rule, stated as a fact rather than a per-session toggle. Mori keeps the summary + metadata locally and never stores the full raw transcript (a pasted / detected transcript is summary-only regardless).
- **Analysis engine:** the Quick Pass engine default is shown in the summary with a 변경 link to settings; it is not chosen during creation.
- **Main actions:** choose agent → choose method → (browse + pick a detected conversation / paste / leave empty) → a single **세션 생성** action in the right-rail summary, which routes the chosen import through Import Review.
- **Privacy expectations:** explicit import only; Mori never starts or drives the agent conversation; detection is an explicit, desktop-only read of Claude work records, never a background scan.
- **Do not:** present this as a multi-source "Work Bundle" builder (that is the manual fallback, not the model); re-introduce per-session retention toggles; let detection imply background watching; or surface planned import surfaces as if wired (keep them honest / 곧).
- **Implementation notes:** `src/features/start-session/StartSessionView.tsx` + `src/features/start-session/DetectedConversationsModal.tsx`. Detection bridge: `src/lib/claude/claudeTauri.ts`; transcript paste: `normalizeAiTranscript`; session creation: `useMoriSessionStore.importAsNewSession` (records / paste) and `createSessionDraft` (empty).
- **Prompt/spec source:** [product-screen-prompts.md](product-screen-prompts.md)

<a id="evidence-hub"></a>

### Evidence Hub

- **Status:** Implemented
- **Product purpose:** Central source/evidence management for Mori.
- **Primary user job:** Add, inspect, and understand the evidence Mori can use to reconstruct work.
- **Key UI elements:** Available source cards (Claude / ChatGPT / AI Conversation / Git Diff / Manual Note / URL), planned connector cards (Codex Transcript / VS Code / Cursor / Terminal / Browser Tabs / Slack / Notion / Figma / File System / Code Editor / Documentation Sites), embedded ImportPanel that opens with the right tab pre-selected, imported sources list, sticky right-side detail panel for the selected source or integration, "Add Source" action, persistent privacy footer.
- **Main actions:** Click an Available card to open the matching import flow with platform pre-selected, click Inspect on any card to see status / capture method / raw policy / privacy in the right panel, click an imported source to see its provenance and related events, remove imported sources, run Quick Pass from the same surface.
- **Data shown:** For each integration: registry status (`Available` / `Partial` / `Planned`), capture method, raw data policy, default trust level, privacy note. For each imported source: integration label, trust level, raw retention, related event count, captured timestamp, related issues/decisions.
- **Source/provenance expectations:** All visible source rows trace back to a `SourceRef`; the detail panel uses `getSourceDisplayStatus()` and `getEventEvidenceSources()` so nothing is hand-rolled.
- **Privacy expectations:** Planned connector cards are disabled with explicit Korean tooltips. The persistent footer reaffirms no background capture, no browser scanning, no automatic account connection.
- **Persistence expectations:** Imports flow through the existing `useMoriSessionStore.addImport` path, so they land in browser draft today and SQLite in Tauri mode automatically.
- **Implementation notes:** Built around `src/features/evidence/`, `src/lib/sources/integrationGroups.ts`, and reuses `src/lib/sources/sourceRegistry.ts` + `traceability.ts` without duplication.
- **Prompt/spec source:** [product-screen-prompts.md#1-evidence-hub](product-screen-prompts.md#1-evidence-hub)

<a id="ai-transcript-import"></a>

### AI Transcript Import

- **Status:** Partial
- **Product purpose:** Paste AI chat transcripts into Mori as evidence.
- **Primary user job:** Bring Claude/Codex/ChatGPT/Other AI conversations into a session without account access.
- **Key UI elements:** Source selector, title input, transcript textarea, raw policy selector, import preview, generated evidence panel.
- **Main actions:** Paste transcript, choose retention, preview, import, cancel.
- **Data shown:** Speaker turns, source count, expected event count, trust level, provenance.
- **Source/provenance expectations:** Transcript source is user-provided text only.
- **Privacy expectations:** No Claude/Codex/ChatGPT account scraping, OAuth, API-key access, or browser scanning.
- **Persistence expectations:** Store summary/metadata unless user explicitly chooses full retention.
- **Implementation notes:** Import normalizers exist; dedicated reference screen remains partial.
- **Prompt/spec source:** [product-screen-prompts.md#2-ai-transcript-import](product-screen-prompts.md#2-ai-transcript-import)

<a id="git-diff-import"></a>

### Git Diff Import

- **Status:** Partial
- **Product purpose:** Import code-change evidence from a selected Git diff.
- **Primary user job:** Turn an explicit repo/range diff into verified file/code evidence.
- **Key UI elements:** Repository card, branch/SHA/dirty status, fetch action, changed file list, diff preview, evidence settings panel.
- **Main actions:** Fetch Git Diff, review changed files, import as evidence, cancel.
- **Data shown:** Repo path, branch, HEAD SHA, dirty state, changed files, additions/deletions, linked event preview.
- **Source/provenance expectations:** Git diff is verified evidence from a selected repo/range.
- **Privacy expectations:** No repo scanning, no file watcher, no automatic fetch.
- **Persistence expectations:** Persist imported diff evidence and repository metadata separately.
- **Implementation notes:** Pasted and Tauri git diff foundations exist; reference screen is partial.
- **Prompt/spec source:** [product-screen-prompts.md#3-git-diff-import](product-screen-prompts.md#3-git-diff-import)

<a id="import-review-evidence-mapping"></a>

### Import Review / Evidence Mapping

- **Status:** Partial · AI Transcript and Git Diff imports now flow through a
  three-column review-before-apply screen with Accept / Discard / Edit per
  extracted event and an Apply / Cancel footer. Manual Note and URL imports
  still apply directly because they each produce exactly one user-typed
  record. The right "Generated items" column renders the intended
  ([이슈] / [결정] / [다음 액션]) sections but stays empty by design · those
  records are produced by Quick Pass running across the whole session.
- **Product purpose:** Review extracted events/items before applying them to the timeline.
- **Primary user job:** Accept, edit, or discard AI interpretations produced from an import.
- **Key UI elements:** Left source summary card (title, integration label, trust, raw retention, capture method, imported time, privacy note); center extracted-events list (title, time, type, confidence, trust, source link, Accept / Discard / Edit per item, bulk Accept / Discard toolbar); right Generated-items panel with empty-by-design Issues / Decisions / Next Actions sections and a Quick Pass hint; sticky apply footer with counts and Apply / Cancel.
- **Main actions:** Accept, discard, inline edit (title / summary / type), bulk accept-all / discard-all, apply accepted events to the session, cancel without applying.
- **Data shown:** Candidate events, confidence, source mapping, edits, accept / discard counts, source provenance.
- **Source/provenance expectations:** Every candidate item points back to the originating SourceRef; the left panel uses `getSourceDisplayStatus()` exactly like Evidence Hub.
- **Privacy expectations:** AI output remains provisional until user review. Nothing reaches the session store until Apply is clicked.
- **Persistence expectations:** Only accepted (and optionally edited) events become durable through `useMoriSessionStore.addImport`. Discarded events leave no record. Cancelling the draft drops everything; the original import was never committed.
- **Implementation notes:** Built around `src/features/review-import/`, `src/lib/review/`, `src/app/reviewStore.ts`. Quick Pass-generated issues / decisions / next actions stay out of this flow · they keep their existing session-wide entry point on Evidence Hub. Inline edit covers title / summary / type today; correction notes and per-item source-mapping diffs are still planned.
- **Prompt/spec source:** [product-screen-prompts.md#4-import-review--evidence-mapping](product-screen-prompts.md#4-import-review--evidence-mapping)

<a id="narrative-timeline"></a>

### Narrative Timeline

- **Status:** Partial · Timeline layout contract, view model, session timing, control honesty, sticky behavior, and relationship policy are now implemented; cross-session aggregation, manual relationship edits, event split/merge, manual issue creation, inline bundle expansion, mini-map viewport navigation, Day / Week / Zoom controls, and event-correction persistence remain Planned.
- **Product purpose:** Primary chronological reconstruction of how work happened.
- **Primary user job:** Scan a session as structured lanes, inspect evidence, and understand major work moments.
- **Key UI elements:** Rendered as the **흐름** tab inside the Session Detail workspace (the SessionDetailHeader + tab bar own the chrome; no per-page header banner). The tab carries a compact one-row toolbar with a **reading-mode toggle (타임라인 / 목록)**, a search field, and a category **Filter** popover. Two reading modes:
  - **타임라인** (swimlane): the time-axis canvas with a sticky time ruler, a lane rail, a lane grid of single-row event / bundle cards, a relationship layer, and a mini-map. The left lane rail flexes to the scroller height so the rail and canvas bottoms align.
  - **목록** (content list, `TimelineChronoList`): a single time-ordered column where each row shows the event's title plus a one-line content preview and meta. This is the **default** reading mode (it reads cleanly without the swimlane's hover-card and alignment edge cases).
- **Category filter:** the Filter popover lists every lane with its count and **shows only the selected lanes** (it no longer dims-and-keeps the rest). Popover counts are derived from all events, so hidden categories stay listable. Density is fixed (no C/M/D control) and the range is always the full session span.
- **Inspector layout:** the embedded inspector flows with the page (it is not pinned to a capped, internally-scrolled height), so opening it never stretches the timeline column and it is never clipped to a fixed height.
- **Main actions:** Switch reading mode (타임라인 / 목록), search, filter to specific categories, select an event / bundle, inspect evidence, copy summary.
- **Data shown:** Events, bundles, trust/confidence, evidence counts, related issues/decisions, source links, hidden-relationship counts.
- **Source/provenance expectations:** Cards and bundles remain evidence-backed and inspectable. The inspector reuses `getSourceDisplayStatus()` plus the new `buildInspectorViewModel` helper so capture method, raw-retention policy, and trust badges stay accurate.
- **Privacy expectations:** Timeline shows provenance rather than implying omniscient capture. No background capture, no terminal scraping, no browser-tab scanning.
- **Persistence expectations:** Timeline items come from stored sources/events/analysis results.
- **Implementation notes:** Owned by `src/features/timeline/`. Pure logic lives in `src/lib/timeline/`: `timelineViewModel.ts`, `relationshipPolicy.ts`, `timelineControls.ts`, `bundleEvents.ts`, `collisionLayout.ts`, `timeScale.ts`. The two reading modes are `TimelineCanvas` (타임라인 / swimlane) and `TimelineChronoList` (목록 / content list), selected by `readingMode` in `TimelineView.tsx` (default `flow` → 목록). The category filter resolves a `visibleLaneOrder` in `buildTimelineRenderModel` so only selected lanes lay out and render; the toolbar's popover counts are computed separately from all events. Session timing is centralized in `src/lib/session/sessionTiming.ts`.
- **Prompt/spec source:** [product-screen-prompts.md#5-narrative-timeline](product-screen-prompts.md#5-narrative-timeline)

<a id="flow-focus-trace-view"></a>

### Flow Focus / Trace View

- **Status:** Partial
- **Product purpose:** Explain causes and outcomes around one selected event.
- **Primary user job:** Understand why a decision/issue/event happened and what it affected.
- **Key UI elements:** Focused central event, upstream causes, downstream results, relationship lines, trace inspector, minimap.
- **Main actions:** View full flow, edit connection, add memo, inspect related sources/items.
- **Data shown:** Relationship reason, confidence, evidence sources, related issues/decisions/files.
- **Source/provenance expectations:** Relationship explanations must be traceable to source evidence or inference.
- **Privacy expectations:** No hidden graph exploration from background capture.
- **Persistence expectations:** Relationships and corrections should persist once editing is implemented.
- **Implementation notes:** Current Flow Focus exists but reference-grade trace panel remains partial.
- **Prompt/spec source:** [product-screen-prompts.md#6-flow-focus--trace-view](product-screen-prompts.md#6-flow-focus--trace-view)

<a id="review"></a>

### Review

- **Status:** Implemented · 5 working tabs (Issue Garden, Decision Log, Next Actions, Unresolved, Suggestions) backed by `selectSessionView`, with a sticky right column that hosts both a per-item detail panel and a session-wide summary panel. Mutating controls now support issue status changes, issue/decision inline editing, decision confirmation/rejection, Next Action completion, and issue promotion to a linked Next Action; demo/read-only states disable those writes honestly.
- **Product purpose:** Turn the session into actionable issues, decisions, and next actions.
- **Primary user job:** Inspect Quick Pass / mock output, follow evidence + timeline links, and triage what still needs review.
- **Key UI elements:** Page header (demo/draft badge); analysis strip (Quick Pass status, provider, generatedAt, counts, dataBasis, Re-run button); 5-tab nav with per-tab counts; Issue Garden 4-column kanban; Decision Log 5-column table; Next Action list; Unresolved reason-tagged feed; Suggestions list; sticky right column with `ReviewDetailPanel` + `ReviewSummaryPanel` (metrics, status stats, priority bar, alerts, next-action preview, data basis).
- **Main actions:** Switch tab, select an item to drive the detail panel, click a related Timeline event to navigate into Timeline, run / re-run Quick Pass (real session), navigate to Evidence Hub when no imports exist.
- **Data shown:** Issues (status, priority, trust, confidence, evidence count, related decisions), decisions (rationale, rejected options, impact, confirmed flag, evidence count), next actions (priority, related issues, related events), unresolved feed (Open / In-Progress / low-confidence / unconfirmed / pending-action reasons), suggestions (per-issue `suggestedNextAction`), summary panel (counts, priority distribution, alerts, data basis).
- **Source/provenance expectations:** Every list and detail surface uses `getIssueEvidenceSources`, `getDecisionEvidenceSources`, `getSourceDisplayStatus`, and `getReportEvidenceSummary` from `src/lib/sources/traceability.ts`. Nothing hand-rolled.
- **Privacy expectations:** Quick Pass never runs silently · only the explicit "Run Quick Pass" button on the analysis strip triggers it. Suggestions tab is gated behind `mode === "demo" || hasAnalysis` so a fresh real session never shows AI suggestions before the user opts in.
- **Persistence expectations:** Reads through `useMoriSessionStore` (browser draft + SQLite). The milestone does not introduce new persistence.
- **Implementation notes:** Pure helpers in `src/lib/review-workspace/reviewWorkspace.ts` (grouping, counts, summary, unresolved feed, default selection, tone helpers) are unit-tested. React surface in `src/features/review/`. Sticky right column collapses below the main column at ≤1180 px, and the 4-column Issue Garden falls back to a 2-column grid at ≤1440 px.
- **Prompt/spec source:** [product-screen-prompts.md#7-review](product-screen-prompts.md#7-review)

<a id="resume-reports"></a>

### Resume & Reports

- **Status:** Implemented · Resume Prompt (with copy + origin badge), Session Summary metric strip, Open Issues / Recent Decisions / Next Actions / Resources cards, .mori v0 package export, and a live Report Builder panel that drives a real Markdown preview with type / section / format / privacy axes. PDF and HTML are visibly disabled with "Planned" labels. Robust redaction (PII masking, per-section diff) remains the next milestone · the privacy toggles only filter the sections they describe.
- **Product purpose:** Continue work or generate privacy-aware reports from the current session.
- **Primary user job:** Copy a resume prompt into the next AI session, or produce a shareable Markdown report from the session.
- **Key UI elements:** Page header with demo/draft badge; analysis strip (status, provider, generatedAt, counts, dataBasis, Run/Re-run); Session Summary metric strip (기간 / sources / events / issues / decisions / next actions); Resume Prompt card with provider badge + copy button + copied confirmation; four work-continuation cards (Next Actions, Open Issues, Recent Decisions, Resources) with Timeline 열기 button; .mori v0 package export strip; right-side Report Builder panel with 5 report types (Personal Retrospective / Team Update / Client-safe Report / Dev Handoff / Work Log), 6 section toggles (Summary / Timeline / Decisions / Issues / Evidence / Next Actions), 3 format buttons (Markdown active, PDF + HTML disabled with "Planned" label), 3 privacy toggles (Client-safe / 원문 제외 / 출처 상세 제외), Markdown 복사 + .md 다운로드 + Preview, live Markdown preview, dataBasis line.
- **Main actions:** Copy resume prompt to clipboard, select report type (changes audience copy + default sections + default privacy), toggle individual include-sections, toggle privacy options, copy generated Markdown to clipboard, download Markdown as `.md`, export .mori v0 JSON (real serialization through `createMoriPackageFromSession`), navigate to Timeline from resource card, run / re-run Quick Pass from the analysis strip.
- **Data shown:** Session metadata (title, duration, dates), evidence counts + dataBasis, Quick Pass provider + generatedAt, resume prompt text, top open issues, recent decisions, all next actions, recent artifacts, live Markdown preview reflecting current selections, warnings (no-sources / client-safe).
- **Source/provenance expectations:** Resume prompt text is sourced from `analysis.summary.resumePrompt` when Quick Pass has run, `view.summary.resumePrompt` for demo, or `buildResumePrompt(view)` as a deterministic fallback. The Resume Prompt card always shows an origin badge ("Quick Pass" / "Demo mock" / "Fallback"). Report Markdown calls `getReportEvidenceSummary()` for the evidence section so source counts, integration breakdown, and trust breakdown are always derived from the registry.
- **Privacy expectations:** Client-safe report type defaults all three privacy toggles to ON and drops sections that leak transcripts. Toggles are honest about their scope · a caveat line below the toggles states that full PII redaction is the next milestone. PDF / HTML buttons are physically `disabled` with `cursor: not-allowed`, "Planned" sub-label, and "다음 마일스톤" tooltip · they cannot be selected as the active format.
- **Persistence expectations:** Markdown export uses Blob + download anchor (browser) · no draft store is created for it. The .mori v0 export still goes through `createMoriPackageFromSession` → `repository.saveMoriPackageDraft` → Tauri `saveMoriPackageJson` (desktop) / `Blob` download (browser).
- **Implementation notes:** Pure logic in `src/lib/report/reportBuilder.ts` (`buildReportMarkdown`, `toggleSection`, `REPORT_TYPE_DEFINITIONS`, `SECTION_DEFINITIONS`) is fully tested. React surface in `src/features/reports/` (`ResumePromptCard`, `SessionSummaryStrip`, `WorkContinuationCards`, `ReportBuilderPanel`, plus the rewritten `ReportsView`). PDF + HTML stay planned; End Session is folded into the Session Summary strip rather than a separate page.
- **Prompt/spec source:** [product-screen-prompts.md#8-resume--reports](product-screen-prompts.md#8-resume--reports)

<a id="end-session-session-summary"></a>

### End Session / Session Summary

- **Status:** Planned
- **Product purpose:** Close a Mori session with saved state, highlights, and next options.
- **Primary user job:** Confirm what was captured, where it was saved, and what to do next.
- **Key UI elements:** Session summary, metric cards, save status, highlight timeline, unresolved items, recommended actions, closing action cards.
- **Main actions:** Save session, generate report, export .mori, start follow-up session, return to dashboard.
- **Data shown:** Duration, sources, events, issues, decisions, next actions, evidence count, storage status.
- **Source/provenance expectations:** Summary must be generated from accepted session records.
- **Privacy expectations:** Local storage status and cloud non-use must be explicit.
- **Persistence expectations:** Browser draft, Desktop SQLite, and .mori package states must be honest.
- **Implementation notes:** Planned; do not wire fake end-session behavior.
- **Prompt/spec source:** [product-screen-prompts.md#9-end-session--session-summary](product-screen-prompts.md#9-end-session--session-summary)

<a id="project-memory"></a>

### Project Memory

- **Status:** Partial · the page is now built around the reference layout (project hero with 6 stat tiles, decisions-over-time, recurring issues, key evidence, recent sessions list combining current + browser draft + SQLite, saved .mori packages, right summary panel with latest decision / unresolved risks / next recommended session / follow-up prompt with real clipboard copy). **Cross-session aggregation (multi-session decisions / issues / recurrence) is still Planned** · today the page counts only the active session's decisions / issues / sources, and lists saved sessions by metadata only. The data-scope note + scope caveat on the summary panel make this honest in the UI.
- **Product purpose:** Long-term memory across sessions in one project.
- **Primary user job:** See accumulated decisions, issues, evidence, reports, and a ready-to-paste follow-up prompt before starting the next session.
- **Key UI elements:** Page header (demo/draft + scope badge); project hero (project name + description + 6 stat tiles for Sessions / Decisions / Issues / Evidence / Reports / Next actions + Follow-up + Latest Report buttons); data-scope honesty note; decisions-over-time card (chronological list with importance + confirmed flags); two-column row of Key Evidence + Recurring Issues Top 5; Recent Sessions list (current + browser-draft + SQLite-saved with per-row storage badges); Saved .mori packages list; sticky right summary panel with project memory caveat, latest important decision, unresolved risks (open + high-priority or low-confidence inferred), next recommended session, and a real follow-up prompt with clipboard copy + 세션 시작 button.
- **Main actions:** Start follow-up session (navigates to Start), open Reports for the latest .mori package, open the current session in Timeline, open a SQLite-saved session via `loadDesktopSession` then jump to Timeline, copy the follow-up prompt to clipboard.
- **Data shown:** Active session counts (decisions, issues, sources, events, next-actions, reports), saved-session metadata (sessionId, project, savedAt, eventCount, sourceCount, storage scope), decision timeline points with importance + confirmed, recurring-issue rows with a heuristic signalScore, key-evidence rows with `getSourceDisplayStatus` integration label + trust + raw-data policy, latest important decision, open high-priority / low-confidence inferred risks, recommended next-session topic, follow-up prompt text.
- **Source/provenance expectations:** Every list and stat uses existing helpers from `src/lib/sources/traceability.ts` (`getSourceDisplayStatus`, `getReportEvidenceSummary`); nothing hand-rolled. Recurring-issue scoring and follow-up prompt content live in `src/lib/project-memory/projectMemory.ts` and are unit-tested.
- **Privacy expectations:** Project Memory shows only sessions the user explicitly imported / saved. The scope note and summary caveat both spell out that there is no background aggregation, no cloud sync, and no automatic Quick Pass.
- **Persistence expectations:** Reads through `BrowserDraftRepository.listStoredSessions()` (browser drafts), `useMoriSqliteStore.sessions` (desktop SQLite), and the current `selectSessionView`. Package listing today is limited to the active session's saved package (via `loadMoriPackageDraft(sessionId)`) because `BrowserDraftRepository` does not yet expose `listMoriPackageDrafts()`.
- **Implementation notes:** Built on `src/lib/project-memory/projectMemory.ts` + `src/features/memory/` (hero + sessions + decisions + recurring + evidence + reports + right summary panel). Cross-session aggregation, saved-report Markdown history, and `.mori` package library remain Planned and are explicitly tagged in the UI.
- **Prompt/spec source:** [product-screen-prompts.md#10-project-memory](product-screen-prompts.md#10-project-memory)

<a id="settings-privacy-local-ai"></a>

### Settings / Privacy / Local AI

- **Status:** Implemented · 5-tab workspace (로컬 AI / Privacy / Storage / Repositories / Connectors) with a status strip across the top and a sticky Trust Summary panel on the right. Local AI exposes 5 provider cards (Deterministic + Ollama Implemented; LM Studio / OpenAI-compatible / Cloud API Planned) with the real Ollama probe. Privacy renders as honest **status cards** (no fake toggles): four "Enforced" guarantees, two "Default on" report-level toggles, one "Planned" robust-redaction line. Storage surfaces Browser draft / Desktop SQLite / .mori v0 / Markdown / zip .mori with real state and the real SQLite init / refresh / persist controls when desktop runtime is present. Repositories preserves the verified Git diff workflow with summary badges (verified / stale / failed / unverified). Connectors shows all 11 registry-defined planned connectors with `Setup · Planned` + `Test · Planned` disabled buttons. The Connector Setup screen reference is intentionally folded into this tab; no separate Connector Setup page is built.
- **Product purpose:** Single local-first control center for trust, privacy, analysis, storage, repositories, and planned connector boundaries.
- **Primary user job:** Confirm what Mori is doing right now, what it never does silently, and what the next setup step should be.
- **Key UI elements:** Page header with mode + runtime badges; status strip (Tauri/Browser + SQLite state + provider + imports + sources + repos); 5-tab nav; main column hosting the active tab's card; sticky right Trust Summary panel with Runtime / Storage / Quick Pass / Session grid, "Mori가 지금 접근하는 것" (4 enforced items), "Mori가 절대 하지 않는 것" (5 enforced items), and a clickable Recommended Next Step button that navigates + activates the right tab.
- **Main actions:** Switch Quick Pass provider (Deterministic ↔ Ollama), edit Ollama endpoint/model/timeout, toggle the fallback switch, run a real Ollama connection probe, apply SQLite migrations, refresh SQLite, persist the active session to SQLite, load a saved SQLite session, add / select / verify / clear-verification / rename / remove a repository, jump to Reports / Evidence / Review from the recommended-step button.
- **Data shown:** Provider rows from `getProviderRows(settings)`, privacy rows from `getPrivacyPolicy()`, storage rows from `getStorageStatusRows(...)`, planned-connector rows from `getPlannedConnectorRows()` (driven by `sourceRegistry.ts`), repository summary from `summarizeRepositories(...)`, recommended next step from `getRecommendedSetupStep(...)`.
- **Source/provenance expectations:** The Connectors tab reads from `getIntegrationsByStatus("planned")` so every card maps back to a registry entry · nothing invented. Each card lists "Mori가 접근할 항목 (활성화 시)" derived from `outputRecords` and a constant `Mori가 절대 하지 않는 것` block.
- **Privacy expectations:** Privacy Defaults are deliberately not toggles · they are baked into the app and rendered as status cards with `Enforced` / `Default on` / `Planned` badges. The Trust Summary panel always reaffirms the no-background-capture / no-browser-scan / no-FS-scan / no-OAuth posture and is mounted regardless of which tab is active.
- **Persistence expectations:** Ollama settings persist through `useMoriSessionStore.updateAnalysisSettings` → `BrowserDraftRepository.saveQuickPassSettings`. Repository settings persist through `useMoriRepositoryStore` → `BrowserDraftRepository.saveRepositorySettings`. SQLite state persists through the existing desktop store. No new persistence layer was added; planned connectors do not persist anything yet.
- **Implementation notes:** Pure helpers in `src/lib/settings/settingsStatus.ts` (provider rows / privacy policy / storage rows / planned-connector rows / repository summary / recommended next step / integration-status label). React surface in `src/features/settings/` (5 cards + trust panel + rewritten `SettingsView`). The Theme switcher from the previous Settings UI is removed (no theming engine yet); when themes land they will come back as a real `localStorage`-backed control.
- **Prompt/spec source:** [product-screen-prompts.md#11-settings--privacy--local-ai](product-screen-prompts.md#11-settings--privacy--local-ai)

<a id="connector-setup"></a>

### Connector Setup

- **Status:** Planned · capture foundation Partial · a pure JSONL connector pipeline exists (`src/lib/connectors/`) plus Claude Code hook + Codex CLI wrapper *templates* and the connector event format docs. The full Connector Setup *screen* is still Planned; today the Settings → Connectors tab shows planned-connector cards with `Setup · Planned` / `Test · Planned` disabled buttons, and JSONL events flow in through the existing AI 대화 import tab.
- **Product purpose:** Future opt-in connector setup and policy screen.
- **Primary user job:** Choose and configure integrations only when the user explicitly wants them.
- **Key UI elements:** Connector grid, selected connector detail, access policy, never-access list, setup checklist, disabled test buttons.
- **Main actions:** Select connector, review policy, follow setup steps, test connection when implemented.
- **Data shown:** Connector status, requirements, capture method, privacy notes, setup steps.
- **Source/provenance expectations:** Connector evidence must be scoped to user-approved integration settings.
- **Privacy expectations:** No connector should appear connected unless it really is; all access is opt-in. The capture foundation enforces this · there is no background daemon, no automatic scan, no OAuth.
- **Persistence expectations:** Connector settings should persist only after implementation. The connector capture pipeline does not introduce new persistence today; events flow into existing `BrowserDraftRepository.addSessionImport`.
- **Implementation notes:** Foundation landed in earlier milestone (typed schema, JSONL parser, redaction, normalizer that buckets events by `(connectorId, sessionId)` into existing source kinds, 39 tests). This milestone adds the **capture surface matrix** (`src/lib/connectors/captureSurfaces.ts`), every paste / hook / CLI / desktop / web / IDE / browser / GitHub / MCP surface with explicit status (Implemented · Partial · Manual-only · Docs-template-only · Planned · Unavailable), four new connector ids (`terminalShell`, `gitCommand`, `desktopTranscriptImport`, `githubPrImport`), one new event kind (`transcript_imported`), and three new docs ([capture-surface-matrix](./connectors/capture-surface-matrix.md), [desktop-web-capture](./connectors/desktop-web-capture.md), [github-pr-import](./connectors/github-pr-import.md)). UI tab for picking a `.jsonl` file directly + a Tauri ingest command remain Planned.
- **Prompt/spec source:** [product-screen-prompts.md#12-connector-setup](product-screen-prompts.md#12-connector-setup)

<a id="edit-event-correction-panel"></a>

### Edit Event / Correction Panel

- **Status:** Planned
- **Product purpose:** Correct AI-inferred Timeline events.
- **Primary user job:** Edit event meaning, time, type, trust, evidence, and related records.
- **Key UI elements:** Modal/panel with title, summary, type selector, time controls, trust selector, evidence links, related issue/decision links, correction note.
- **Main actions:** Save changes, cancel, mark as user verified, add/remove evidence/links.
- **Data shown:** Event fields, trust level, source evidence, related issues/decisions, user correction note.
- **Source/provenance expectations:** Corrections should preserve original AI inference and user override provenance.
- **Privacy expectations:** User verification is explicit and should not mutate evidence silently.
- **Persistence expectations:** Requires correction persistence before shipping active controls.
- **Implementation notes:** Planned; current inspector should keep correction controls disabled/planned.
- **Prompt/spec source:** [product-screen-prompts.md#13-edit-event--correction-panel](product-screen-prompts.md#13-edit-event--correction-panel)

<a id="product-overview-screen-map"></a>

### Product Overview / Screen Map

- **Status:** Reference only
- **Product purpose:** Single reference image showing Mori as a coherent product system.
- **Primary user job:** Orient future implementation tasks around the full app surface map.
- **Key UI elements:** Thumbnail map of major screens and product promise.
- **Main actions:** None; planning material only.
- **Data shown:** Screen names and system-level product flow.
- **Source/provenance expectations:** Not an app data surface.
- **Privacy expectations:** Reinforces local-first posture and user-controlled import.
- **Persistence expectations:** None.
- **Implementation notes:** Reference only. Do not treat overview thumbnails as implemented screens.
- **Prompt/spec source:** [product-screen-prompts.md#14-product-overview--screen-map](product-screen-prompts.md#14-product-overview--screen-map)

## Older Normalized References

The repository also keeps earlier reference images that remain useful for visual comparison:

- `Timeline Main earlier reference`
- `Flow Focus earlier reference`
- `Review / Issues & Decisions earlier reference`
- `Resume Report earlier reference`
- `Start Session reference`

Use the screen-specific reference sections above as the planning source of truth, and use older references only for historical comparison unless a future task explicitly chooses them.



