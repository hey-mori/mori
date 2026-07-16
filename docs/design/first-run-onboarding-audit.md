# First-run onboarding · current-state audit

Status: **audit + recommendations, 2026-07-15, HEAD ~`ebe8b37`.**
Code-verified reconstruction of what a brand-new user experiences from
first launch to first value, desktop and browser. Every claim cites a
file. Corrects one stale planning assumption: a first-run system
**does exist** (`src/features/onboarding/FirstRunGuide.tsx`, state in
`src/lib/onboarding/onboardingState.ts`, shown once via the
`mori.onboarding` flag); the gaps are elsewhere.

## Verdict

Time-to-value is **bimodal and honest but under-guided**. The target
user (desktop, existing Claude Code history) gets a genuinely fast
payoff: the first auto-import pass populates 세션 과거 with up to 400
real sessions ~4s after launch (`useAutoImportSessions.ts:41-135`),
and the first-run overlay offers a one-click Claude hook install
(`FirstRunGuide.tsx:205-214`). Every other path relies on
self-directed discovery. The machinery of the core loop is sound and
works offline on the deterministic engine; the gaps are almost
entirely **demo-state labeling** and **first-action nudges**, which
are cheap to close.

## What works today (keep)

- FirstRunGuide: auto-shows on a fresh install, desktop branch lists
  detected agents with inline 연결 (1-click hook install), honest
  browser branch, never nags (one flag, reopenable).
- Demo data is a deliberate, curated fixture set
  (`src/lib/demo/demoSessionFixtures.ts`) so the shell never reads as
  broken; demo and real sessions are a clean either/or, never mixed
  (`sessionStore.ts:647,701-705`), and 전체 초기화 honestly wipes both
  stores (`clearAllDataAndViewDemo`, `sessionStore.ts:1077-1123`).
- The composer teaches by example (placeholder + format chips + live
  detection hint, `RecordComposer.tsx:232,91-107`) and captures fully
  offline on the deterministic default, with a graceful failure path
  ("원문은 보관됐어요").
- Browser mode is honest about desktop-only features everywhere it
  matters (guide, AutoImportCard, SourcesView, connect status).

## Gaps (each with the smallest honest fix)

| # | Gap | Sev | Smallest fix |
| --- | --- | --- | --- |
| 1 | ✅ Fixed 2026-07-16. Home now shows a quiet `데모 미리보기` pill and reads "N개 예시 세션" whenever the canvas falls back to `DEMO_SESSION_SUMMARIES`, so demo data never reads as the user's real work (`MoriCommandSpaceHome.tsx`). Record-count awareness (Gap #9) is the remaining half. | High | ~~A quiet 데모 pill in the status row whenever the sessions came from `DEMO_SESSION_SUMMARIES`~~ done |
| 2 | Home has no first-action guidance; a brand-new user and a power user see the same populated-looking canvas, so the empty state teaches nothing | High | When stored sessions AND ledger records are both zero, one line under the input: 첫 기록 쓰기 · 에이전트 연결 |
| 3 | The guide's primary desktop CTA routes to session import (`requestStartRecords`), not the everyday 기록 capture loop | Med | Third guide action 첫 기록 쓰기 → `requestNewRecord()` |
| 4 | 세션 empty state ("세션을 선택하세요", `SessionsWorkspace.tsx:81-86`) never routes to 연동 when no agent is connected | Med | Zero past sessions + no connected agent → 에이전트 연결하기 CTA into 설정 > 연동 |
| 5 | Richer analysis is invisible: deterministic default is silently permanent; Ollama is discoverable only by opening 설정 > 분석 엔진 (`LocalAiCard.tsx`) | Med | One-time dismissible hint after the first deterministic analysis result |
| 6 | Browser build names what it cannot do but never points to the desktop app; no download pointer exists anywhere (`AboutCard.tsx:83-88`) | Med | 데스크톱 앱 받기 link in AboutCard + the guide's browser branch |
| 7 | 기록 empty states are bare ("아직 메모가 없습니다", `NoteExplorer.tsx:186`; editor placeholder, `DocumentEditor.tsx:57`) | Low | Empty editor CTA starts a capture |
| 8 | Demo exit lives only in 설정 > 저장소 > DemoModeCard; not reachable from where demo is actually seen | Low | 실제 데이터로 전환 action beside the existing demo badge in ImportPanel |
| 9 | **Two independent emptiness notions**: capturing 기록 records never updates Home, which keys on *sessions* only, so Home shows demo indefinitely even after the user has real records | Low today, worsens with S2 | Home considers record count too before falling back to demo |

Gap 9 is also a small preview of the S2 world: once agent sessions are
kernel records
([`session-kernel-dual-write-spec.md`](session-kernel-dual-write-spec.md)),
"do I have real data" must be answered by the ledger, not by the
legacy session store; fixing it by reading record count is a step in
the right direction rather than a patch.

## Recommended slices

- **O1 (High pair, small):** demo pill on Home + the two-zero
  first-action line. Together they make the new-user state legible in
  one glance without redesigning the canvas doctrine (ambient + ⌘K
  unchanged).
- **O2 (Med, small):** guide third action + 세션 empty CTA. Both are
  routing additions to existing affordances.
- **O3 (Med, small):** the one-time engine hint + the browser
  download pointer. The hint must obey copy-diet: one line, dismiss
  forever, never a modal.
- **O4 (Low):** empty-state CTAs and demo-exit surfacing, opportunistic.

None of these is a wizard; the doctrine (calm, no nagging, honest
states) survives every fix. Sequencing: O1 anytime (it is honesty, not
onboarding); O2-O3 after the current 세션 workspace churn settles to
avoid file contention with the implementing sessions.
