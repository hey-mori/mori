# Daily-driver ergonomics · current-state audit

Status: **audit + recommendations, 2026-07-15, HEAD ~`a6519d6`.**
Code-verified friction audit of the actions a real user performs many
times per day: starting a capture, finding a record, reviewing
candidates, following provenance, managing notifications. Every claim
cites a file. Companion:
[`first-run-onboarding-audit.md`](first-run-onboarding-audit.md)
(first-session gaps),
[`global-search-spec.md`](global-search-spec.md) (S1, which several
findings compose with).

## Verdict

The core loop is sound but **mouse-bound and single-item**. The most
repeated action in the product (새 기록) has no keyboard path at all
and no out-of-app path; review flows are strictly one-by-one; records
are leaves, not hubs (no record→session/project handoffs); and one
settings surface is dishonest (notification category toggles exist and
do nothing). Every fix below is small; none touches doctrine except
where explicitly staged.

## Findings

### E-F1 · Capture has no keyboard path and no continue mode (High)

- The only entry is the rail 만들기 menu → 새 기록
  (`Sidebar.tsx:57,104-113` → `store.requestNewRecord`,
  `store.ts:383`), and Sidebar is its **only** caller. The app-level
  key listener handles just Cmd/Ctrl+K / Cmd/Ctrl+P
  (`AppShell.tsx:57-68`). Dozens-per-day action, zero keyboard route.
- No submit-and-continue: after save the composer lands in a terminal
  `saved` banner and `LedgerWorkspace.onSaved` unmounts it and jumps
  to the record (`composerMachine.ts:182-185`,
  `LedgerWorkspace.tsx:71-76`). Capturing three thoughts in a row is
  three full round-trips.
- **Out-of-app capture does not exist**: `src-tauri/Cargo.toml:20-22`
  ships only dialog + notification plugins; no global-shortcut, no
  tray, no capture window.

Doctrine note for the out-of-app path: a global OS hotkey **while the
app is running** (focused, unfocused, or minimized) is an input
affordance and clean under current doctrine. A tray-resident capture
that outlives the closed app is the separate, identity-changing
decision the goal doc already names (surveillance-line note); it is
not proposed here.

### E-F2 · The palette is branded 검색 but can neither search nor create records (High)

`CommandTarget` = navigate | openSession | openSettings |
toggleSidebarCollapsed | setTheme (`commandPalette.ts:26-31`); entries
are commands + legacy session titles only. This is the same gap S1
already specifies for search; the capture half (a 새 기록 command) is
one entry + the existing `requestNewRecord`. S1 + this = the "⌘K is
the front door" promise becoming true.

### E-F3 · Notification category mutes are dead controls (High, honesty)

A full per-category preference model exists
(`src/lib/settings/notificationPreferences.ts:7-48`) and renders as
toggles (`NotificationsCard.tsx:93-97`), but **nothing consumes the
`enabled` map**: `useNotifications.ts`, `useOsNotifications.ts`, and
the OS gate (`osNotification.ts:101-118`) never check it; only
`toastPosition` is read. Toggling a category off does nothing, which
violates the no-fake-states doctrine on a settings surface. Related
noise vector: during active agent work the 90s auto-import pass emits
an OS-eligible "세션 N건 업데이트" notice repeatedly
(`useAutoImportSessions.ts:43,118-133`, `osNotification.ts:46-56`);
per-pass coalescing exists and quiet polls are silent, but an active
session re-notifies every pass.

### E-F4 · Review flows are strictly one-by-one (Med)

확인 필요 candidates: per-record 반영/무시 only
(`ReviewStrip.tsx:74-81`); date resolution: per-record only
(`ReviewStrip.tsx:115-148`); NoteExplorer: single-select, no bulk
discard (`NoteExplorer.tsx:45,150-158`). After an import lands N
candidates, the user pays N clicks with no 모두 반영.

### E-F5 · Records are leaves, not hubs (Med)

- 캘린더 → 기록 exists (`CalendarView.tsx:19,33`, the only
  `openRecordInLedger` caller). Notifications route correctly
  (`AttentionIndicator.tsx:188-202`).
- Dead ends: record → its session (no affordance in
  `RecordInspector.tsx:149-177`), record → its project context (none),
  and 프로젝트's session row drops to the generic list, losing which
  session (`ContextView.tsx:106` calls `navigate("sessions")` without
  loading it).
- No copy-record-as-markdown anywhere in the daily loop (copy exists
  only in reports/workbench, `ReportBuilderPanel.tsx:167`).

### E-F6 · Entity and context management is embryonic (Med, expected)

Entity rename-with-alias works (`RecordInspector.tsx:224-253`,
`useRecordLedger.ts:104-106`); there is no entity browser, no merge,
no delete. Context create/rename/delete exists only in **legacy**
views (`projectStore.ts:25-58` via `ProjectFormModal` in
ProjectView/WorkspaceView), not in the v4 프로젝트 (`ContextView` is
read-only). Consistent with the kernel-integrity review's F2/F3
(engine ahead of cockpit); listed here because daily use hits it via
"이 기록을 프로젝트로 옮기고 싶다".

### E-F7 · Input/output conveniences (Low)

Drag-drop exists only internally (calendar date assignment,
`LedgerCalendarView.tsx:84,123-166`); no window-level file/text drop
to capture. Keyboard handling is scattered across 32 components with
no registry and no `?` cheatsheet.

## Friction table (top rows)

| Action | Frequency | Cost today | Smallest fix |
| --- | --- | --- | --- |
| 새 기록 시작 | dozens/day | mouse-only, 2 clicks + route | `n` (outside inputs) + Cmd/Ctrl+Shift+N in the AppShell listener → `requestNewRecord()` |
| 연속 캡처 | high | dismiss + re-open per thought | saved phase gains 계속 쓰기 returning to idle in place |
| 기록 찾기/열기 | high | palette cannot; explorer-local only | S1 (already specified) |
| 후보 N건 검토 | per import | N clicks | 모두 반영 header action |
| 알림 카테고리 끄기 | as needed | toggle does nothing | wire `enabled` into feed + OS gates |
| 기록→세션/프로젝트 이동 | daily | dead end | two actions in RecordInspector + fix ContextView session row |
| 앱 밖에서 캡처 | high want | impossible | global-shortcut plugin + quick-capture window (staged) |

## Recommended slices

- **E1 · Keyboard capture (small, now).** The two bindings + a
  `계속 쓰기` affordance in the saved phase. Also fold a 새 기록
  command into the palette (composes with S1's producer work).
- **E2 · Honest notifications (small, now).** Wire the category
  `enabled` map into `useNotifications` and the OS gate, and suppress
  repeat OS pings for the same still-growing session within a pass
  window. Alternatively remove the toggles until wired; a dead
  control may not ship.
- **E3 · Bulk review (small).** 모두 반영 + bulk date resolution in
  `ReviewStrip`, looping the existing single-record actions.
- **E4 · Record as hub (small-medium).** 세션 열기 / 프로젝트 열기 /
  markdown 복사 in `RecordInspector`; fix the ContextView session row
  to open the specific session.
- **E5 · Out-of-app quick capture (medium, staged).** Add
  `tauri-plugin-global-shortcut` + a minimal always-on-top capture
  window feeding the normal pipeline. While-app-running only;
  tray-resident capture after close stays out (identity decision).
- **E6 · Shortcut registry + `?` cheatsheet (small, opportunistic).**
  One shared keydown registry so E1/E5 and future g-nav don't each
  add listeners; the cheatsheet renders from the registry so it can
  never drift.

Sequencing: E2 is an honesty fix and should not wait. E1 attacks the
highest-frequency action. E3-E4 ride whichever session touches those
files next. E5 after the current 세션 workspace churn settles.
