# Top-Level Surface Direction Note · Home / Sources / Dashboard / Workbench

Status: directional planning note, not a locked product decision.

Date: 2026-05-29

This note records the intended shape of Mori's top-level navigation and the
job of each surface. It is written as planning context for future LLM-assisted
implementation, not as a binding spec. Future work may keep, rename, merge, or
discard these surfaces if usage or implementation pressure points somewhere
better. It supersedes the earlier draft that explored Home / Dashboard / a
generic "work surface"; the thinking has since settled on a four-tab model and
a single rule for right-side panels.

## 1. The Core Idea

Good navigation does not split by data type. It splits by the **axis** along
which the user wants to see the same underlying data. Mori has one dataset
(sessions, projects, evidence, memory). What changes between surfaces is the
question the user is asking.

| Tab | Organizing axis | The user's question |
| --- | --- | --- |
| 홈 | time | "I just opened Mori. What do I continue?" |
| 소스 | input | "How do I get my work into Mori?" |
| 대시보드 | project | "How are all my projects doing, and where do I go deep?" |
| 워크벤치 | session | "Let me lay out several sessions and review them together." |

Two consequences follow from this framing:

- **The individual project page is a drill-through, not a tab.** This already
  holds today: the sidebar's `isActive` treats an open `ProjectView` as a
  drill-down and does not light up the 프로젝트 nav slot (only the all-projects
  browser does), the same way 메모리 is reached through a project action rather
  than a standing tab. The four-tab model preserves this, not changes it.
- **Home and Dashboard stop competing.** Home is "recent / right now" (time).
  Dashboard is "by project" (browse and compare). They show overlapping data
  but answer different questions, so neither needs to absorb the other.

This is the proposed standing navigation: **홈 · 소스 · 대시보드 · 워크벤치**.
It replaces today's 홈 · 소스 · 프로젝트 by repurposing the project-axis nav slot
(today the `workspace` key, labelled 프로젝트, rendering `WorkspaceView`) into a
real comparison surface, and adding the session axis as the new workbench.

### Current code anchors (verified 2026-05-29)

So the next implementer starts from reality, not from this note's prose:

- Standing nav lives in `Sidebar.tsx` `PRIMARY_NAV`: `home` (홈) · `connections`
  (소스) · `workspace` (프로젝트). View routing is in `App.tsx` by `currentView`.
- `home` renders `HomeView` (eager-loaded landing). `connections` renders
  `SourcesView`. `workspace` renders `WorkspaceView` (the all-projects browser).
  `project` renders `ProjectView` and is already a drill-through, not a nav slot.
- `HomeView` today does mix concerns: it gathers per-session metrics
  (`gatherSessionMetrics`), routes (`navigate` / `openSession`), and renders the
  usage panel, metric toggle, and row components inline. The pure derivation is
  already split out into `lib/home/homeOverview.ts` (`buildHomeOverview`).
- Home is **not** single-column today: `home-top-grid` is a two-column layout, a
  `home-main-stack` (activity card + 최근 세션) beside a `home-next` column
  (다음 단계 + 사용 현황).

## 2. The One Rule for Right-Side Panels

Mori already holds a doctrine, learned from a prior audit: **a right rail is a
Context Inspector for the selected item, never a place to park page
structure.** The main canvas must explain the page on its own. Page-level
dashboards, alert centers, and feeds belong in the canvas, not the rail.

Applying that rule per surface, so no screen reintroduces the
"every page has a rail full of tabs" anti-pattern:

| Surface | Right side |
| --- | --- |
| 홈 | No selected-item inspector (nothing to select). A light 다음 단계 / 사용 현황 secondary column is fine, but it must not grow into an alert feed; alerts live in the sidebar bell. |
| 소스 | Inspector for the selected provider (already correct today). |
| 대시보드 | Inspector for the selected project row. Review / attention counts stay in the canvas. |
| 워크벤치 | Inspector for the selected session tile. Cross-session attention stays in the canvas. |

Note that Home's secondary column is a plain content column, not a tabbed
context inspector, so it is not the anti-pattern the doctrine targets. The
doctrine forbids parking page structure in a *tabbed rail* and requiring
tab-switching to inspect a selection. Home has no selection, so a calm
two-column landing layout is fine.

If a panel would explain the *selected thing*, it is an inspector and may live
on the right. If it is *page structure* (totals, feeds, routing), it goes in
the main canvas.

## 3. Home (홈)

Job: a five-second landing. "What is ready to continue, and what needs me?"
Home stays light. It does not accumulate metrics, live panels, or analytics.
Today it is already a calm two-column layout; the direction is to keep that
shape and cap it, not rebuild it.

Composition. Main column, top to bottom:

1. **이어서 할 작업** (one dominant band). The single most relevant thing to
   resume: a session or project, with one primary action (이어가기). This is
   the hero, not a greeting. No avatar, no welcome copy that eats vertical
   space. (New; today the main column leads with the activity card.)
2. **활동 요약.** The contribution heatmap (`WorkActivityCard`), as a calm
   summary only. This is the one place the heatmap belongs at landing scale.
3. **최근 작업.** Five or six recent sessions as compact rows. Each row is
   project · relative time · status · next action. Clicking a row opens the
   session or its project (drill-through).

Secondary column (the existing `home-next`):

4. **다음 단계** (capped to 3 to 4). Routed actions only: 이어가기, 검토 필요한
   결정, 가져오기, 리포트. Each routes to the surface that owns it. Never a wall
   of equal-weight cards, and never an alert feed.
5. **사용 현황** (optional). The compact usage snapshot, only when real usage
   data exists. Keep it small; it is context, not the story.

Avoid on Home: multi-session panels, a live feed, a large alert center, deep
project analytics, a project comparison table (that is Dashboard's job), and
more cards than the recent list can sit beside calmly.

Component direction:

- Keep `buildHomeOverview` summary-only. Do not let it grow into the dashboard
  aggregator.
- Split `HomeView` into `HomeResumeBand`, `HomeAttentionCards`,
  `HomeRecentSessionList`, `HomeActivitySummary` (the last wraps the existing
  `WorkActivityCard` / `ContributionHeatmap`).
- Home never owns multi-session layout state.

## 4. Sources (소스)

Job: bring work in. This surface already matches the model. It is a
provider-level overview (one tile per anchor agent and per evidence source)
with every import method, access detail, and action in a right inspector for
the selected provider. That inspector is the *correct* use of a right panel,
so Sources needs no redesign here.

The only thing this note adds: name it explicitly as the **input axis** of the
four-tab model, and keep the Work Bundle demoted to an advanced disclosure, as
the goal doc already specifies.

## 5. Dashboard (대시보드)

Job: the project axis. "How are my projects doing, and where do I go deep?"
Dashboard absorbs today's project list (`WorkspaceView`) as its body and
becomes the entry point into any single project.

**Guardrail: this is not a BI chart wall.** The name pulls toward graph dumps;
resist it. The body is a project list with state and a door into each project.
Charts are at most one calm row.

Composition:

1. **Light scoped toolbar.** All-projects scope, search, optional date range.
   Minimal. No heavy filter bar.
2. **Compact metric strip** (5 to 6 max). Total sessions, active projects,
   this week's activity, 미확정 결정, open issues. Reuse `MoriMetricStrip`.
   Every metric states its scope when incompleteness matters.
3. **프로젝트 현황 (the body).** One row or compact card per project: name,
   last active (relative), session count, unresolved issues / decisions,
   memory state. Clicking a project drills through to its full page. This is
   where `WorkspaceView`'s listing now lives.
4. **활동 / 사용량** (one row). A single heatmap or cadence view. Not several
   competing charts.
5. **검토 / 메모리 요약.** Actionable counts with drill-through: 검토 필요 N,
   승격 가능한 메모리 N, stale / contradicted N. This is a canvas summary, not
   a live feed and not a right rail.

Right side: an inspector for the **selected project row** (quick provenance,
recent activity, recommended next action, and a button to open the full
project page). It explains the selection; it is not a standing attention rail.

Component direction:

- `buildDashboardOverview` (pure, cross-project aggregation) feeds
  `DashboardView`.
- `DashboardMetricStrip` (reuse `MoriMetricStrip`), `ProjectStatusList`
  (absorbs `WorkspaceView`'s content), `DashboardActivityRow` (reuse the
  activity card), `ReviewMemorySummary`, `DashboardProjectInspector`.
- Start with the project comparison and attention routing, not with charts.

## 6. Workbench (워크벤치)

Job: the session axis. "Lay out several sessions and review them together."
This is the surface closest to the earlier "control tower" idea, but scoped
honestly to what Mori's data can support today.

**Guardrail: read-only multi-session review first.** Mori is local-first,
imports sessions explicitly, and never starts or drives an agent (a stated
product identity and non-goal). So the first Workbench is a calm **review
spread**, not a live operations console. It shows imported / saved session
state side by side. The "send a request, watch it run, get a response"
behavior is deferred until a real connector or runtime can back it honestly.
Until then, no tile may read as "live" or "running".

Composition:

1. **Toolbar.** Open session count, layout preset (1 / 좌우 / 2x2), status
   filter, add or replace a panel from saved sessions.
2. **Panel grid.** One read-only `SessionTile` per visible session. A tile
   shows: status header (가져옴 / 검토 중 / 완료, honest statuses only), a mini
   timeline, a recent message preview, a next-action strip, and an
   open-review count. Tiles expand, collapse, replace, or focus.
3. **선택 패널 인스펙터** (right). The focused tile's detail: provenance,
   evidence, full next actions. It inspects the selected tile, nothing more.
4. **교차 세션 주의 사항** (canvas strip, not rail). Only meaningful attention
   items (needs review, completed, failed import), rendered as a compact strip
   in the canvas like the existing review overview strip, so it never competes
   with the inspector on the right.

Deferred until a real live target exists: `SessionActionComposer`
(per-tile, then maybe multi-target). Documented now so the layout reserves a
place for it, but not built against imported-only data.

Component direction:

- `buildWorkbenchState` (pure) derives visible panels, statuses, and attention
  items from loaded / saved sessions.
- `WorkbenchView`, `WorkbenchToolbar`, `WorkbenchLayoutPicker`,
  `WorkbenchPanelGrid`, `SessionTile` (with `SessionStatusHeader`,
  `SessionTimelineMini`, `SessionMessagePreview`, `SessionNextActionStrip`),
  `WorkbenchInspector`, `WorkbenchAttentionStrip`.
- The session tile has its own data contract. It is not a trimmed copy of a
  Home recent-session row, and it does not depend on Home or Dashboard state.
- Reuse timeline view-model logic, but render a purpose-built compact mini
  timeline.

### Shipped status (updated 2026-05-30)

The Workbench has since grown past the first read-only slice. Implemented now,
all over already-imported local data and still honestly read-only (no agent is
ever driven):

- **Free composition canvas** with resizable columns, stacked panels,
  drag-to-reorder / relocate, and saved layout presets.
- **Compact controls**: quick-layout presets (single / columns / grid), a
  density toggle, and per-panel header collapse.
- **Selected-session inspector** (right, collapsible): provenance, the honest
  count strip, and the real open issues / unconfirmed decisions / pending next
  actions. Lives in `WorkbenchView`, not a generic tile component.
- **Cross-session attention strip** (canvas, not rail): the placed sessions
  with an open issue or unconfirmed decision, derived by the pure
  `buildWorkbenchAttention` (`src/lib/workbench/attention.ts`). Click to focus.
- **Command palette (⌘K) and keyboard control**: panel focus (1–9, [ ]),
  view mode (m), collapse (c), close (x), inspector (i), focus mode (f),
  search (/), and a `?` cheatsheet overlay.
- **Unified search** filters and highlights every open panel at once and dims
  the ones with no match.
- **Focus (maximize) mode** to read one panel full size, and a **compare
  matrix** to scan every placed session's counts side by side.
- **Honest bottom bar**: a local scratch note plus the palette launcher, no
  fake send button.

Panel work-item counts and timeline come from the same source the rest of the
app uses (`loadSessionMemoryBody` for real sessions, `buildDemoSessionContent`
for demo sessions), so the workbench is no longer empty on the sample data.

Still deferred until a real live target exists: `SessionActionComposer`
(sending a request to an agent). The layout already reserves room for it.

## 7. Retiring the Old Project Surfaces (Without Deleting)

When a surface leaves the standing navigation, **unwire it, do not delete it.**
Remove it from the nav and let the code and route stay in place, dormant or
reachable through the command palette / a drill-through. This is reversible,
avoids churn, and is friendly to the autonomous loop that edits the repo
concurrently. Mori already does this: 메모리 is no longer a tab but is still
routable through a project action and the palette.

Apply the same pattern here:

- **`WorkspaceView` (the all-projects list)** is the surface behind today's
  `workspace` / 프로젝트 nav slot. Its listing role moves into Dashboard's
  프로젝트 현황 body. Either point the slot at a new `DashboardView` and leave
  `WorkspaceView` dormant, or evolve `WorkspaceView` in place into the richer
  surface. Retire, do not delete: keep the old component reachable.
- **`ProjectView` (a single project)** needs no demotion: it is already a
  drill-through, not a standing tab (the sidebar never lights the 프로젝트 slot
  for an open project). The four-tab model just keeps wiring Dashboard rows and
  Home recent rows to it.

General rule for this codebase: prefer retiring a surface (drop it from
navigation, keep the code) over deleting it, unless the code is provably dead.

## 8. Data Honesty Rules (carried across all surfaces)

- Do not say "live", "running", or "working" unless Mori has a real live
  signal. Imported sessions read as imported / captured / recent.
- Every metric states its scope when incompleteness matters.
- Missing data removes a panel or shows a precise empty state. It never
  produces fake zeros.
- Review-before-apply stays intact. Dashboard and Workbench may surface review
  needs but never auto-promote memory or decisions.
- Local-first and explicit-import constraints hold. No background scanning, no
  account access, no always-on capture by default.

## 9. Open Questions

- Is **대시보드** the right label, or does a calmer word (현황, 전체 보기) better
  signal "projects and their state" rather than "BI charts"?
- Is **워크벤치** the durable label for the session axis, or 작업대 / 스테이션?
- Does the metric strip belong on Dashboard, or is it noise once the project
  list carries per-project state inline?
- What is the minimum honest first version of a `SessionTile` when only
  imported sessions exist?
- How are Workbench layout presets persisted: local UI preference, workspace
  setting, or per project?

## 10. First Safe Slice If Implemented

Sequenced so today's product keeps working at every step:

1. **Split Home into smaller render components** with no behavior change
   (`HomeResumeBand`, `HomeAttentionCards`, `HomeRecentSessionList`,
   `HomeActivitySummary`).
2. **Add a Dashboard route** with `buildDashboardOverview` built only from
   already-available local data. Move `WorkspaceView`'s project listing into
   `ProjectStatusList`, and unwire the old project-list tab (keep its code).
   Wire each project row to drill through to `ProjectView`.
3. **Build a read-only `SessionTile` prototype** from saved / imported
   sessions: title, project, honest status, recent activity, next action,
   open-review count.
4. **Add a Workbench route** that arranges those tiles with static layout
   presets and a canvas attention strip. Right side is the selected-tile
   inspector.
5. **Add the composer only later**, when there is a real target and clear
   session-routing semantics.

This keeps Home light, gives the project axis a real comparison home, adds the
session axis honestly, and reuses the inspector doctrine on every surface.
