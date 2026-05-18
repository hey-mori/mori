# Mori Autonomous Development Loop

This document is the operating guide for Ralph-style autonomous
development of Mori. It is a **living document** — sections 7 and 8
(the backlog and the next slice) are kept current as the project
evolves. Sections 1–6 and 9 are stable policy.

Read [`docs/mori-project-goal.md`](mori-project-goal.md) first; it is
the canonical product direction, implementation-status guide, and
non-goal list. This document governs *how* the loop runs.

## 1. Operating Goal

Keep building Mori into a real local-first AI work memory product.

The product loop is:

```
Claude / Codex / ChatGPT / CLI / Git / terminal work
→ explicit capture/import
→ Preview
→ Import Review
→ Timeline / Evidence Hub
→ Project Memory
→ Consolidation Review
→ Accepted Memory
→ Resume Prompt / Reports
→ continue work
```

## 2. Ralph Behavior

Ralph should:
- inspect current repo state
- choose the next highest-value production slice
- implement it
- test it
- update relevant docs
- update this autonomous loop document if the backlog changes
- commit exactly one clean commit
- continue to the next slice automatically

Ralph should not stop just because:
- one milestone is complete
- a milestone is substantial
- a fresh session would be nicer
- a small product decision is needed
- a living goal document update is needed

If a capability is large, Ralph should split it into the smallest
useful production slice and start.

## 3. Decision Standard

Ralph may make product decisions when they are governed by:
- docs/mori-project-goal.md
- existing architecture
- local-first principles
- review-before-apply principles
- evidence-first principles
- long-term extensibility

Choose the option that is:
- product-coherent
- extensible
- testable
- honest about current capability
- safe for user data
- compatible with SQLite, .mori packages, desktop workflows, and
  future connectors

Do not choose temporary shortcuts just because they are easier.

## 4. Hard Non-Goals

Never implement:
- account scraping
- Claude Desktop database scraping
- ChatGPT browser scraping
- Cursor internal database scraping
- browser history scraping
- screen recording
- keylogging
- hidden clipboard capture
- hidden background monitoring
- cloud sync by default
- OAuth integrations
- external account reading
- always-on daemon
- scheduled consolidation jobs
- automatic memory writes without review
- Workroom / Session Canvas / pixel-agent UI unless explicitly
  reprioritized
- Google ADK / Gemini dependency
- embeddings/vector search as source of truth
- broad unrelated rewrites

## 5. Validation Contract

Before every commit:

```
npm run check:full
npm run build
git diff --check
git status --short
```

If src-tauri changed:

```
cd src-tauri
cargo check
cargo test
cd ..
```

## 6. Commit Rules

One clean commit per production slice.

Do not include:
- Co-Authored-By
- Generated with Claude
- AI footers
- validation logs
- audit logs
- “already in place”
- “no changes”

Do not push unless explicitly asked.

## 7. Current Autonomous Backlog

Maintain this list as the project evolves. Capability-based names
only — no phase numbers.

**Completed (do not redo):**
- Queryable Memory — accepted-memory search helper
  (`searchAcceptedMemories`).
- Queryable Memory — Project Memory search UI (`QueryableMemoryCard`).
- Queryable Memory — extension to timeline events, evidence sources,
  and review-action notes (`searchProjectMemoryReferences`).
- Local Connector Capture polish — real `mori-local-capture` output
  verified to round-trip; clean-repo git snapshot coverage added.
- `.mori` native file-open affordance — file picker on the
  Consolidation Review import panel (browser `File` API, no Tauri).
- `.mori` auditTrail package slice — optional additive
  `auditTrail?: StoredMemoryReviewAction[]` on `MoriPackageV0`,
  populated on export with `getPackageAuditTrail` read helper.
- Memory Audit Trail reviewed revert flow — eligibility planner,
  proposal builder, apply helper, per-entry view-model eligibility,
  and the confirm-gated Revert affordance in the audit card.
- SQLite / `.mori` parity cleanup — schema-completeness check now
  covers the V003 accepted-memory tables (`consolidated_memories` /
  `consolidated_memory_audit`) in `requiredSqliteTables`.
- CLI wrapper for Claude/Codex workflows — `mori-local-capture.py
  --transcript -` reads a piped CLI session from stdin (explicit,
  local-only, no subprocess wrapping or background watching).
- IDE / Terminal integration planning — explicit-capture design doc
  in `source-integrations.md` (explicit emit, no background watch).
- SQLite `importSummary` mirror — complete: V004 `session_imports`
  migration, `sessionImportRows` converters, the Rust repository, the
  `persist` / `list` / `list_all` Tauri commands, the runtime-aware
  `SessionImportRepository`, and `loadConnectorImportHistorySavedSessionsAsync`
  wired into the `ImportPanel` connector preview so desktop sessions
  feed the re-import rollup.
- Native file picker for `.mori v0` — `save_mori_package_json_as`
  (Save As) and `pick_mori_package_file` (Open) native dialogs, wired
  into the Reports export and the Consolidation Review import panel.
- Local Connector Capture bridge — `mori-local-capture.py` covers
  transcript (file + stdin), note, git working-tree, and `--git-commit`
  inputs, all verified through the connector-pipeline fixture test.
- `.mori` zip-like file layout — `buildMoriPackageFileLayout` turns a
  `MoriPackageV0` into the documented one-file-per-slice map
  (dependency-free; the zip archiving step is a separate decision).
- `.mori v0` import validation hardening — `validateMoriPackage` now
  checks each slice's per-record identity fields with precise paths.
- `.mori` zip-like layout round-trip — `parseMoriPackageFileLayout`
  reassembles a validated `MoriPackageV0` from the one-file-per-slice
  map, the inverse of `buildMoriPackageFileLayout` (dependency-free).
- Connector template fixture coverage — the `claude-code` and
  `codex-cli` connector sample JSONL are guarded by pipeline
  round-trip tests, mirroring the local-capture fixture test.
- IDE integration — first artifact: `connectors/vscode-task/`, a VS
  Code task template that runs `mori-local-capture.py` on an explicit
  Run Task action (no extension, no watcher).
- Terminal integration — first artifact: `connectors/terminal-helper/`,
  a `mori-capture` shell function wrapping `mori-local-capture.py`
  (git / commit / note / transcript) on an explicit command.
- Real `.mori` zip package — `fflate` dependency added;
  `zipMoriPackage` / `unzipMoriPackage` archive the canonical file
  layout into a real `.mori` zip and validate it back.
- `.mori` zip export wiring — the Reports export writes a real
  `.mori` zip (desktop `save_mori_package_zip_as` Save As dialog;
  browser zip blob download).
- `.mori` zip import wiring — the Consolidation Review import panel
  reads a real `.mori` zip; picked bytes route by the `PK` zip magic
  (`parseImportedMemoryProposalsFromZip`), JSON / paste still works.
- Team / shared memory specification — `docs/team-shared-memory.md`:
  the explicit `.mori` handoff sharing primitive, roles, privacy
  boundaries, client-safe export rules, conflict / duplicate model.
- Client-safe `.mori` package filter — `buildClientSafeMoriPackage`
  (pure transform: only `clientSafe` / non-sensitive memory,
  surviving-memory audit rows, `clientSafeExport` manifest flag).
- Client-safe export UI — the Reports `.mori` package strip's
  "client-safe export" action runs the filter before `zipMoriPackage`
  and reports kept / dropped memory counts.
- `.mori` handoff workflow — `team-shared-memory.md` §7: the explicit
  Author export → transfer → Reviewer import walkthrough.
- Real capture walkthrough — `docs/real-capture-walkthrough.md`: an
  end-to-end guide capturing real Claude / Codex / Git work through
  the shipped capture artifacts into the full Mori loop (Track B.3).
- Capture-surface matrix honesty — `captureSurfaces.ts` now lists the
  `localCaptureBridge` surface and the VS Code / terminal rows point
  at the shipped explicit-capture templates; stale `nextStep`s fixed.
- Client-safe marker surfaced on import — `ParseImportedMemoryResult`
  carries `isClientSafe`; the Consolidation Review import panel notes
  a client-safe package so the Reviewer knows the handoff is partial.
- Workspace previous-session continuation — `setCurrentSession`
  repository promotion (no `savedAt` restamp) plus the
  `loadBrowserSession` store action; the Workspace project hub's
  saved, non-active session rows carry an "이어가기" action that opens
  the session and routes to the Timeline.
- Runtime theme switcher — `settings.themeSwitcher` is now implemented:
  a local `themePreference` model + `themeStore`, applied to `<html>`
  via `data-mori-theme` (and pre-paint in `main.tsx`), with a Settings
  → 화면 card switching `formal` / `forest` and rendering `nightLake`
  as an honest disabled Planned option.
- Workspace issue-resolution progress — the Workspace summary rail
  shows resolved-issue and next-action counts derived from persisted
  session state.
- Next Action completion — the first real Review-surface write: a
  persisted `done` / `completedAt` on `NextAction`, a
  `setNextActionCompletion` store action that writes the session
  analysis + memory body, a Review detail-panel toggle, and
  completion-aware Workspace / Reports / Resume / Companion / Project
  Memory surfaces (completed actions drop out of future-work prompts).
- Issue status change — `review.statusChange` is now implemented: a
  `setIssueStatus` store action (same analysis + memory-body write
  path as Next Action completion) and a Review detail-panel status
  picker; the Workspace resolved-issue progress is now live.
- Decision confirmation — `review.confirmDecision` is now implemented:
  a `setDecisionConfirmed` store action on the same write path and a
  Review detail-panel confirm / reject toggle; the unresolved feed
  drops confirmed decisions automatically.
- Review inline editing — `review.editIssue` and `review.editDecision`
  are now implemented as user correction writes: issue title /
  description and decision title / decision text / rationale can be
  edited from the Review detail panel, marked `editedByUser` /
  `editedAt`, and persisted through the analysis + memory-body write
  path while preserving evidence, trust, status, confirmation, and
  timeline links.
- Issue promotion to Next Action — `review.promoteToNextAction` is now
  implemented: a Review issue can add or open a linked Next Action using
  the issue's suggested action, priority, related issue id, and source
  event ids; duplicate promotions select the existing action instead of
  creating another row.

**Open priority (highest first):**

The four approved roadmap tracks have had their concrete, well-defined
slices shipped:

- **Track A (Real `.mori` zip)** — complete: zip helper, export, import.
- **Track B (IDE/terminal capture)** — complete: `vscode-task` and
  `terminal-helper` templates, real-capture walkthrough,
  capture-surface matrix honesty. A real editor extension is
  deliberately gated on the explicit-capture contract being proven
  in use (deferred).
- **Track C (Team/shared memory)** — complete: spec, client-safe
  filter, client-safe export UI, handoff workflow, import marker.
- **Track D (continued loop)** — ongoing.

Remaining named items are **conditional** — each needs a concrete
defect or a clear safe slice before it can be honestly defined; the
loop must not manufacture vague polish to avoid this:

1. Project Memory UX polish — open; needs a concrete defect /
   improvement observed against real captured data.
2. Queryable Memory extensions — open; needs a clear, safe slice.

Deferred — revisit when a concrete need appears:
- Evidence / Import Review polish — audited; the Import Review view,
  the `review` lib, and the connector pipeline are mature and
  well-tested. Revisit when real captured data exposes a specific
  honesty / correctness defect.
- Optional watched-inbox tray — borders on the no-background-watcher
  non-goal; the refresh-only desktop inbox already covers the safe
  case. Revisit only with a concrete, explicitly-triggered design.
- A real editor / browser extension — the explicit-capture task and
  shell-helper artifacts ship; an extension waits for that contract
  being proven in real use.
- Cloud sync / remote collaboration backend for shared memory — a
  hard non-goal; team memory ships as spec + `.mori` handoff only.

When an item ships, move it to **Completed** and renumber the open
list. When the goal document's Current Gaps change, reconcile this
backlog with it.

## 8. Current Next Slice — Product Maturity Loop

The loop is in a **Product Maturity** mode: auditing the running app
surface-by-surface and hardening it into a coherent product, not
adding new capabilities. "Done" means a surface looks coherent, its
states are honest, primary buttons work or explain why not, and real
data can flow through it.

**Product maturity backlog** (highest value first). Capability-named,
concrete, and split small. When a slice ships, tick it and pick the
next; do not compress this list — it is the audit surface.

Shipped:

1. ✅ Responsive layout floor removed; app fits 1024 / 768 with no
   page-level horizontal scroll.
2. ✅ Sidebar profile + status pills no longer wrap mid-phrase.
3. ✅ Evidence source state clarity — disabled cards show an inline
   reason; active-session cards get a full-width primary CTA; card
   titles clamp to two aligned lines.
4. ✅ Start Session capture honesty — the source picker separates
   available explicit imports from planned integrations; planned
   surfaces are marked, unselected, and not checkable, so a session
   never implies Mori captures an app it cannot.
5. ✅ Settings runtime status hierarchy — the debug-style badge row
   is now a labeled `settings-runtime-summary` grid of four
   `RuntimeStat` cells (Runtime / Storage / AI provider / This
   session) with honest tone dots; the browser build reads "Browser
   localStorage", not "SQLite · unavailable".

6. ✅ Reports export feedback — the `.mori` package strip now tracks
   an honest export phase (idle / running / success / error /
   cancelled) with a toned, ARIA-live feedback line, a running
   spinner, and per-action busy labels; `writeMoriZipPackage`
   returns a structured result instead of a bare string.

7. ✅ Project Memory lifecycle health — the eight accepted-memory
   statuses now collapse into four lifecycle groups (current /
   advisory / attention / archived) via a tested
   `memoryLifecycle` helper; the Accepted Project Memories card
   shows a lifecycle health strip, orders the preview so guidance
   memory leads, and visually recedes archived rows.

8. ✅ Review trust clarity — the Review surface stopped rendering
   raw `TrustLevel` enum strings ("inferred" / "verified") and now
   reads the canonical `getTrustDisplay` labels everywhere (issue
   cards, decision rows, detail panel, related events); the
   duplicate `trustTone` in `reviewWorkspace` is removed, and the
   detail-panel trust badge carries a hover description.
8a. ✅ Review / Reports label consistency — the Unresolved and
    Suggestions tabs rendered raw priority enums (`high` / `medium`)
    while Issue Garden showed `priorityLabels`; all now use the
    shared labels, and the Reports / Review analysis-strip count
    badges read Korean units instead of "sources / events / …".
8b. ✅ Evidence data-basis copy — `getSessionEvidenceSummary` no
    longer emits the English `dataBasis` descriptor ("No data" /
    "Imported sources + Quick Pass analysis"); it is Korean, and
    the three exact-string tests were updated to match.
8c. ✅ Start Session provider honesty — the Local AI engine picker now
    derives its provider states from the same feature-status registry as
    Settings. Ollama remains the only selectable session engine; LM Studio,
    OpenAI-compatible endpoints, and Cloud API stay visible but disabled
    with concise Planned reasons, so starting a session never implies a
    provider Mori cannot run.
8d. ✅ Timeline action status honesty — the app-wide feature registry and
    legacy Timeline control registry now mark shipped inspector correction
    actions as implemented: edit event, split, merge, create issue, add note,
    memo save, and session end. Product-honesty counts and control tooltips
    now match the real Timeline write path.
8e. ✅ Evidence Hub import focus — opening Add Source now places the import
    panel at the top of the Evidence workflow, before integration browsing,
    while planned connectors are collapsed behind an honest disclosure so
    unavailable integrations no longer compete with the next real action.

### Timeline Maturity Loop (focused sub-pass)

Making the Timeline a real day-scale work-reconstruction surface, not
a demo/overview. Highest value first.

- ✅ Real density tiers — a third `dense` tier joins
  `comfortable` / `compact`. Dense uses 132×38 cards (icon + time +
  one truncated title row, no footer), tighter lane heights, a
  tighter bundle window, and a higher `maxVisibleItemsPerLane` so a
  lane shows more individual events before clustering. The toolbar
  density control is now a 3-way segmented control (넓게 / 보통 /
  조밀); `densityBundleTuning` centralises the per-tier bundling
  params.
- ✅ Progressive card content — the comfortable event card footer
  used to print three competing English meta tokens ("2 src ·
  3 issues · 1 dec"). It now shows one calm Korean signal
  (`primaryMeta` — evidence count, or a combined link count when
  there are no sources). The bundle card footer likewise dropped
  its English `metaParts` line and now carries only the Korean
  type-mix line; full per-category counts stay in the inspector.
- ✅ Duration-aware card width — card width is now the pixel span
  of the item's `[start, end]` on the time scale, clamped to a
  per-density readable range (`computeItemWidth` +
  `DENSITY_WIDTH_BOUNDS`). A short / end-less event collapses to a
  cardlet minimum; a long event stretches toward the maximum;
  bundles size to the cluster's real span. (Demo events are mostly
  instantaneous, so the variation is most visible on bundles — the
  day-scale stress fixture below will exercise ranged events.)
- ✅ Timeline empty states Korean — all three `TimelineEmptyState`
  variants (demo-empty / draft-no-imports / draft-needs-quick-pass)
  were fully English on an otherwise Korean surface; they are now
  Korean, including the first surface a real session shows.
- ✅ Burst overflow clarity — the bundle card count reads Korean
  (`N개 이벤트`) and the bundle inspector — the surface a burst
  expands into — is fully Korean and reviewable: it lists every
  clustered member event, the Korean `describeBundleKind` /
  `describeBundleReason` labels (raw enums no longer reach the
  UI), type mix, and represented evidence.
- ✅ Same-source rapid grouping — a bundle now carries
  `sameConnectorSource`: when every clustered member shares one
  connector id (`connectorEventId` prefix), the bundle is flagged
  as a same-source rapid group and the bundle inspector says so.
  `deriveBundleConnectorSource` is the tested pure helper; the
  stress fixture's connector-imported morning burst exercises it.
- ✅ Layout module cleanup — the duration-aware-width change left
  dead per-density `width` fields on two redundant dimension
  records; collapsed to a single `DENSITY_CARD_HEIGHT` map (card
  width has one source of truth, `DENSITY_WIDTH_BOUNDS`).
- ✅ Inspector collapse — a toolbar toggle (`인스펙터`) collapses the
  right inspector so the Timeline canvas reclaims the full content
  width for scanning; wired through the previously-dead
  `inspectorCollapsed` store state. Collapse applies to Timeline
  mode only (Flow Focus keeps its Trace panel).
- ✅ Narrow-width inspector auto-hide — at ≤1180px the side
  inspector auto-hides (`shouldHideInspector`) instead of stacking
  awkwardly under a horizontally-scrolling canvas; the toolbar
  toggle is disabled with an explanatory tooltip. Verified at
  1024 / 768 — no page-level overflow, canvas scrolls horizontally
  as designed.
- ✅ Narrow-width chronological list — at ≤1180px the Timeline
  swaps the horizontally-scrolling swimlane canvas for
  `TimelineChronoList`, a flat vertical list of every event /
  bundle ordered by start time (time · type icon · title · trust
  · one calm meta signal). Row selection drives the same
  `selectedEventId`, so widening the window restores the swimlane
  with the selection intact. Verified at 768 — readable, no page
  overflow.
- ✅ Narrow-width inline detail — a selected chronological-list
  row now discloses its detail inline (event: summary + trust +
  confidence + linked-item counts; bundle: summary + member
  titles), so the Timeline stays a reconstruction surface on
  narrow screens where there is no side inspector.
- Responsive Timeline — the chronological list with inline detail
  now covers narrow widths; a dedicated overlay/drawer inspector
  is no longer required for the minimum-viable experience.
- Inspector responsibility — remaining card metadata could move
  further into the inspector.
- ✅ Day-scale stress fixture — `buildTimelineStressEvents` is a
  deterministic 36-event working-day fixture (every lane, morning
  bursts, same-time clusters, short + 45/90-minute ranged events,
  mixed trust). `timelineStress.test.ts` uses it to guard
  single-row lanes under bursts, burst → bundle clustering, dense
  vs comfortable frame height, duration-aware width, and that no
  raw summary leaks into the card view model.

### Companion Layer (focused sub-pass)

Making Mori feel like a quiet, serious, local work partner — not a
dashboard, not a chatbot, not a character. The Companion Layer is a
local, evidence-based assistance layer derived from data the user
has already imported and reviewed. It never watches the user, never
writes memory automatically, and never reads raw source/transcript
text into a signal.

- ✅ Companion Signals — `buildCompanionSignals`
  (`src/lib/companion/companionSignals.ts`) is a pure helper that
  derives a prioritised, capped set of evidence-based signals from
  the active session (demo-mode notice, real-session import gap,
  import-ready when sources exist but Quick Pass has not run,
  weak-evidence inferred issues, decisions needing review, open
  issues, next actions, important decisions, ready-to-report,
  ready-to-resume). Each signal carries severity, an honest `basis`
  (verified / inferred / mixed / state), linked item ids, evidence
  refs, an action label, and a destination.
- ✅ Companion card — `CompanionCard` ("Mori 노트") renders the top
  signals on the Reports surface: calm, serious, severity-dotted,
  with a basis chip and an action button per signal, an honest
  empty state, and a footer reminding the user Mori only uses
  explicitly-imported data.
- Planned (not built): OS / system notifications, an in-app
  notification center or review queue, a session-end companion
  summary, resume-companion improvements, signal-quietness
  preferences. A chatbot / avatar is explicitly out of scope.
- ✅ Companion card on Project Memory — the "Mori 노트" card now
  also renders on the Project Memory surface via a shared
  `useCompanionSignals` hook, so Reports and Memory build signals
  the same way without duplicating the wiring.
- ✅ Companion memory-health signal — `useCompanionSignals` now
  loads accepted project memory through the runtime-aware
  repository and feeds an `attentionMemoryCount` (stale +
  contradicted lifecycle group) into `buildCompanionSignals`,
  which raises a `stale_memory` review signal pointing at Project
  Memory. Read-only — the companion never writes memory.
- ✅ Companion strip on the Timeline — `CompanionStrip`, a compact
  one-line affordance, surfaces the single highest-priority signal
  plus a "+N" count above the Timeline toolbar; clicking it routes
  to that signal's surface. Suited to the canvas layout, which has
  no card column.
- ✅ Companion guidance on Review + Evidence — `CompanionStrip`
  also sits at the top of the Review and Evidence surfaces, so
  "what needs attention" (decisions to review, weak evidence,
  unresolved issues, import-ready) is visible on every core work
  surface, not only Reports / Project Memory.
- Companion-layer maturity backlog (highest value first):
  1. a small in-app review queue or notification center;
  3. a session-end companion summary;
  4. resume-companion improvements;
  5. preferences for signal quietness.

### Account / Profile / Settings expansion (planned)

Eight concept references for a planned account/profile/settings area
are saved under
`docs/assets/screenshots/account-profile-settings/` and indexed in
[`docs/account-profile-settings-references.md`](account-profile-settings-references.md)
(screen-map, Welcome / local-first sign-in, Local Profile Setup,
Account & Profile, Privacy & Data Control, Security & Device Sessions,
Notification Center / Companion Inbox, Workspace & Projects). These
are design references only — not final copy, not committed screens.

Roadmap passes (each a future session; the reference doc carries the
full per-pass scope / risk / behavior breakdown):
1. Notification Center / Companion Inbox — the Companion Layer's
   dedicated surface, built on the existing `companionSignals` /
   `CompanionCard` / `CompanionStrip` foundation. Highest value —
   the code foundation already exists.
2. Privacy & Data Control — promote the Settings privacy tab into a
   fuller surface.
3. Account & Profile page shell — reads a local profile; account /
   plan rendered as a planned state.
4. Local Profile / Account IA planning — routing, the local-profile
   data model, and the auth-is-not-data-access boundary.
5. Login / local-first entry, Workspace & Projects, Security &
   Device Sessions, Settings nav restructure — later.

Hard constraint: Local Profile is the default identity; a Mori
Account is always optional; authentication never implies external
data access; capture stays explicit and reviewed.

**Next recommended implementation pass:** Notification Center /
Companion Inbox (roadmap pass 1).

Open (highest value first):

9. Timeline density + event inspector — long event lists have no
   grouping; selecting an event needs a coherent detail panel.
10. Evidence local-capture hierarchy — the working local-capture
    bridge card competes visually with planned integrations; promote
    the surface that actually works.
11. Empty / loading / error / success state sweep — audit every
    primary view for all four states; several only handle empty.
12. Shared status badge system — tone usage (green / blue / purple /
    gray / amber / red) is inconsistent across views; needs one
    documented scale.
    - ✅ Shared product-state model — `src/lib/product-state/` defines
      one typed vocabulary for the app's core product states across
      five families: availability (`available` / `partial` /
      `planned` / `unavailable` / `requiresSetup` / `demoOnly` /
      `browserOnly` / `desktopOnly`), runtime / storage
      (`browserLocalStorage` / `desktopSQLite` / `fallbackActive` /
      `localOnly`), data / provenance (`imported` / `clientSafe` /
      `inferred` / `verified` / `observed` / `userProvided` /
      `summaryOnly` / `fullTextRetained`), memory lifecycle
      (`accepted` / `edited` / `watching` / `deferred` / `stale` /
      `contradicted` / `superseded` / `retired`), and companion
      (`info` / `suggestion` / `review` / `risk` / `needsReview` /
      `readyToReport` / `readyToResume`). Each state maps to a label,
      a Korean description, and one semantic tone shared with
      `MoriStatusBadge` and the `data-mori-tone` theme tokens.
      `productAvailabilityFrom*` mappers bridge the older
      `FeatureStatus` / `IntegrationStatus` taxonomies; `MoriStatusBadge`
      derives its tone from the model instead of a badge-local map.
    - ✅ Settings + Evidence adoption — the Settings provider cards and
      the runtime / storage strip, and the Evidence integration cards
      plus `evidence/provenance.ts` status labels, derive labels and
      tones from the shared model. Planned / unavailable surfaces keep
      their honest, not-connected boundaries.
    - ✅ Memory + Companion adoption — accepted-memory lifecycle
      labels / tones moved into the product-state model. Memory /
      Accepted Memories (`AcceptedMemoriesCard`, the consolidation
      review proposal card, the Memory Audit Trail card) and the
      Companion surfaces (`CompanionCard` / `CompanionStrip`, via
      `companionSeverityTone`) now derive their labels and tones from
      the shared model. Memory lifecycle, trust / provenance, and
      companion suggestion state stay distinct families — a companion
      signal is always a reviewable suggestion, never an automatic act.
    - ✅ Trust / status helper consolidation — `MoriFeatureStatusBadge`
      derives its tone from the shared model instead of a badge-local
      `TONE_TO_DATA` map; `IntegrationCard` reuses `getTrustTone` rather
      than a local `TRUST_TONE` map; the unused, duplicated
      `statusLabelForIntegrationStatus` (overlapping
      `getIntegrationStatusLabel`) was removed; and the Evidence
      `SourceDetailPanel` / Import-review `SourceSummaryCard` status and
      trust badges moved onto `MoriStatusBadge` / `MoriTrustBadge`,
      dropping their local `STATUS_TONE` maps. Trust / provenance,
      memory lifecycle, companion suggestion, and feature availability
      stay distinct families — no concepts were merged.
    - Open — the broader `Badge` → `MoriStatusBadge` migration is
      intentionally partial and should continue surface-by-surface, not
      as one reckless rewrite. Remaining trust-badge sites
      (`KeyEvidenceCard`, `ReviewDetailPanel`, `ImportedSourceRow`) and
      the Timeline card trust map (`timelineCards.ts`) are deliberately
      left for their own focused passes; the legacy `FEATURE_STATUS_TONE`
      scale used by `productFlow.ts` is left untouched until its
      consumers can move together.
13. Settings provider cards — planned / unavailable AI providers
    still look like selectable options; mark them clearly.
14. Settings trust panel — the privacy / trust text block is dense;
    restructure into scannable local-first rules.
15. Connectors panel noise — the planned-connector list is honest
    but visually heavy; calm it without hiding the honesty.
16. Demo vs real consistency — every view should show the demo /
    live badge and behave honestly on switch; audit views that
    ignore session mode.
17. Browser-prototype vs desktop-SQLite honesty sweep — wherever
    persistence is surfaced, copy must not imply SQLite in the
    browser build.
18. Consolidation Review proposal clarity — proposal list, accept /
    revert affordances, and the client-safe marker need grouping.
19. Import Review duplicate / conflict state — duplicate and
    conflicting imports need a distinct, explained visual state.
20. Queryable Memory discoverability — the search card is buried;
    surface it and clarify which corpus it searches.
21. Scroll / sticky-header consistency — page headers, panel
    headers, and action bars scroll inconsistently across views.
22. Korean / English copy consistency — mixed-language labels appear
    within a single surface; pick a rule and apply it.
    - ✅ Timeline `EventInspector` — section headers, trust copy,
      linked-item labels, action buttons, and the inspector-scoped
      `timelineControls` entries are now Korean, matching the
      `ReviewDetailPanel` sibling.
    - ✅ Flow Focus surface — `FlowFocusHeader`, `FocusPathSummary`,
      and `TracePanel` are now Korean (mode name "Flow Focus" and
      app-wide relationship/trust labels deliberately kept).
    - ✅ Timeline toolbar — range / zoom / filter / density labels,
      the popover, the planned-honesty line, and the
      `rangeDay/rangeWeek/zoomIn/zoomOut` registry entries are
      Korean.
    - ✅ Evidence Hub — the Quick Pass status badge no longer shows
      the raw `succeeded/failed/running/idle` enum, provider-name
      copy is Korean, and the section count badges read "개 통합 /
      개 계획됨 / 개 출처".
    - ✅ Import Review — the draft meta strip's seven duplicate /
      validity count labels and the footer counts + cancel button
      are now Korean.
    - ✅ Connector JSONL preview — the `ImportPanel` preview card's
      duplicate badges, "include duplicates" label, the
      valid-events / invalid-lines / connectors / event-kinds /
      time-range / project-paths definition list, and the bucket
      event counts are now Korean.
    - ✅ Connector inbox + provenance labels — the `ConnectorJsonlInbox`
      heading and refresh control, and the `provenance` capture-method
      and raw-data-policy labels surfaced on every evidence source row
      ("원본 전체 보관", "수동 입력", …) are Korean. The
      Implemented/Partial/Planned/Unavailable status vocabulary is
      deliberately kept English as the canonical status terms.
    - Open: other English-only surfaces can be swept as spotted.
23. ✅ Sidebar session timer honesty — a just-started session was
    labeled "Saved" with a frozen `00:00:00` clock because
    `createSessionDraft` seeds `endedAt` with the creation
    timestamp; `deriveSessionTiming` now treats an `endedAt` that
    is not strictly after `startedAt` as no genuine end, so a
    fresh session reads "Live" and the clock counts up.
24. Component architecture cleanup — repeated card / badge / panel
    markup should converge on shared components to stop drift.
    - ✅ Shared `SegmentedControl` — the three hand-rolled
      `<div className="segmented">` clusters (Timeline time-range,
      Timeline density, Evidence Quick Pass provider) now render through
      one typed `src/components/ui/SegmentedControl.tsx`. Disabled
      segments stay visible so a planned range honestly shows what it is;
      density stays a three-tier discrete choice (no fake slider
      granularity over three real card geometries). Backed by the
      existing `.segmented` stylesheet rules — adoption changed no pixels.
    - Open — `MoriCard` / panel / toolbar markup convergence continues
      surface-by-surface; no reckless one-pass rewrite.
25. Real-session walkthrough fixture — a checked-in fixture that
    drives one real capture → import → timeline → memory pass for
    manual QA.

The core capture flow is verified working: Start Session creates a
real session, Evidence actions enable, and an import-less Timeline
shows a designed empty state. Demo vs real state is honest (a "데모
세션" / "Live session" badge and a Show demo / real toggle).

## 9. Stop Conditions

Stop only if:
- working tree is dirty in a way Ralph cannot understand
- validation fails twice after attempted fixes
- the next task requires cloud sync, scraping, watchers, credentials,
  or account access
- the next task requires Workroom / Session Canvas / pixel-agent UI
- the next task requires a new dependency with product/security
  implications
- the next task requires destructive or ambiguous migration
- the next task cannot be split into a small production slice
- Ralph is about to push

Do not stop because a clean boundary was reached.
Clean boundary means commit and continue.
