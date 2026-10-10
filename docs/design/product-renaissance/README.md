# Product Renaissance · mission record

The engineering execution record of the 2026-10-10 Product Renaissance program:
what was audited, what shipped, how each change was verified, and what is still
owed. The product direction that came out of it, including every decision left
to the owner, is in [`roadmap.md`](roadmap.md). The operator's own acceptance
pass is [`acceptance-walkthrough.md`](acceptance-walkthrough.md).

Baseline: `main` 65e7d0db (end of the integrity program). Evidence, binaries and
screenshots live outside the repository in
`~/mori-handoff/evidence-2026-10-10-renaissance/` (`LEDGER.md`, `AUDIT.md`,
`shots/`).

## Evidence levels

Every claim below names its level. None of this program reached operator or
production level; those are the walkthrough's job.

| Level | Meaning here |
|---|---|
| unit | Vitest or Rust tests in the gate (`scripts/check.sh --full`). |
| browser | The Vite build in headless Chromium (Playwright), demo data. |
| synthetic runtime | The release binary, isolated profile, a synthetic transcript under the trial's own `CLAUDE_CONFIG_DIR`. |
| real-source runtime | The release binary, isolated profile (a copy of `~/mori-trial-final`), real transcripts read-only. Nothing was archived or copied from them. |

Remote CI is manual-only and did not run for any of these PRs.

## Cycles

### A · audit
Fifteen runtime screenshots of every surface on real sources (`AUDIT.md`). The
findings that shaped the program: real sessions drew as unlabeled ticks; CLI
markup leaked into titles; the project page listed the same sessions twice; a
calendar day lumped 37 sessions into one row; dashboard, workbench and graph
were decorative; Home was a command canvas (owner decision, kept).

### B · timeline comprehension
- #234: a tick-width card prints its title in the free space to its right
  (`labelRooms`), never over a wider earlier card. Real-source runtime.
- #252: the last tick of a lane (often where a session ended) prints its
  title to its left when the right has no room, sharing a gap with the
  previous title rather than overlapping it; only label-printing ticks claim
  room. Synthetic + real-source runtime.
- #236, #242: transport markup (command tags, stdout wrappers, paste markers,
  system reminders) is cleaned for display on every surface that shows agent
  text, with named notices (명령, 명령 출력, 세션 이어가기, 요청 중단). Unit +
  real-source runtime.

### C · timeline interaction
- #244: arrow keys keep the selection on screen and move focus with it; a lane
  edge no longer scrolls the canvas away; keys stay inside menus and dialogs;
  the embedded timeline sizes to its pane, so the inspector is no longer
  clipped beside the session list; an event with no end no longer reads
  "HH:MM - 진행". Browser + real-source runtime.
- #249: a session opens at a zoom sized to its event count (about 24 per
  screen, 1x to 8x) instead of a fixed 8x, fixed when it first shows events;
  the frame follows the pane so 1x fits; a clicked card stays on screen when
  the inspector rescales the axis. Synthetic + real-source runtime.

### D · project chronology
- #239: the project page's 흐름 is a day-by-day chronology of confirmed members
  (reviewed membership only), each session on the day of its last activity
  with its start day noted, quiet stretches marked, date-only records without
  an invented clock, PRs the sessions mention. Real-source runtime.

### E · cross-surface continuity
- #240, #241: a calendar day unfolds its sessions, grouped by reviewed project
  (through `membershipState`), then 프로젝트 확인 필요, then folder, then none.
- #245: a session opened from a calendar day shows "← 캘린더 M월 D일" and
  returns to that day, selected and unfolded. Real-source runtime.
- #251: a session whose transcript is gone (nothing imported or kept) opened
  from the calendar, a project page or Home dropped the user on the live feed
  with no word. It now opens as its record, which says 원본 대화를 열 수
  없습니다 and shows the recorded period and the PRs it mentioned. Found with
  the real lost transcript below. Real-source runtime.

### F · records and knowledge
- #248: the session reader marks a message something was already kept from
  ("남긴 기록") and opens that record; with the record's existing 원본 열기 the
  loop session → record → session is closed. Synthetic runtime (a real
  transcript was deliberately not captured from).

### G · functional and visual maturity
- #246: the timeline hover preview follows request disclosure (bodies only; see
  the roadmap for titles).
- #247: an empty tool result no longer reads as the user's turn (it could even
  become a session title), an image-only result reads as an image result, and
  terminal escape codes are stripped from tool output. Stored imports made by
  older builds refresh such turns in place instead of diverging. Unit +
  synthetic + real-source runtime.
- #250: the dashboard groups by source folder but called each group a project;
  its copy now says 폴더.

### H · reliability and acceptance
See [`acceptance-walkthrough.md`](acceptance-walkthrough.md). Measurements
taken on the real-source trial during this program:

| What | Measured |
|---|---|
| OCI session (215 events), open to 활동 | opens at 800%, labels readable without zooming |
| Arrow key step, selection to on-screen | every step lands inside the scroller (x=639 of 482-964, browser) |
| Calendar month, real profile copy | 43 records, one day with 37 sessions, unfolded in one row |
| Stored imports with tool-result turns affected by #247 | 0 in the trial profile (checked read-only) |

### I · synthesis
The roadmap, the docs reconciliation (timeline UX, project-aggregate spec) and
this record.

## Integrity guarantees, rechecked

- Reviewed membership is the only project authority on every surface this
  program touched (chronology, calendar, back links). Folder groups are named
  folders.
- No surface invents a time: date-only records show no clock; sessions are
  placed by observed activity; "진행" is no longer claimed for a past event.
- Read-only views stayed read-only. The only writes added are the user's own
  capture actions that already existed.
- Source content is treated as data: markup is rendered as text or removed,
  never executed.
- No trial profile was deleted; no transcript tree was linked or copied.
- **Lost source, reported.** The real transcript `-home-isaac-dev-infra/efca9454…`
  (24.8 MB), past Claude Code's 30-day cleanup on 2026-10-09 and kept only on
  operator approval, was no longer on disk on 2026-10-10 (its folder was
  modified that day; 13 other transcripts remain). No copy was taken, as
  agreed. Its session record survives (read-only check); since #251 it opens
  as that record and says the original cannot be opened.

## Owed

- Operator walkthrough (not run by the agent).
- The owner decisions listed in the roadmap.
