# Product Renaissance · operator acceptance walkthrough

A pass the operator runs on a real machine to accept or reject the program.
The agent verified these steps in an isolated profile, except where noted (2.2
and 2.4 in the browser build, 6.3 by unit tests only); this walkthrough is
what turns that into operator evidence. About 20 minutes.

**Before you start.** Use a build of `main` at or after the program's last
merge. To keep your real profile untouched, run it the way the trials did:
`~/mori-handoff/bin/real-launch.sh <copy-of-a-profile> <binary>` (transcripts
are read, never written). Nothing below archives or copies a transcript.

Mark each step pass or fail; a fail names what you saw.

## 1 · A long session reads as a timeline
1. Open a session with a few hundred events that shows the tab bar (세션 →
   pick one → 활동 → 타임라인). A transcript over 8 MB opens as the reader
   ("최근 대화 일부 표시 중") without tabs; pick another for this step.
2. Without zooming, the 대화 and 명령 lanes print readable titles beside their
   ticks. No `<command-name>` or similar markup appears anywhere.
3. A session with only a handful of turns opens at 100% with every card on
   screen.

## 2 · Selecting and walking the timeline
1. Click a card. It gets a ring and the inspector opens; the card is still on
   screen after the timeline narrows.
2. Press → several times. Each step lands on the next card of the lane, the
   card stays in view, and the inspector follows.
3. Press ↓. The selection moves to the nearest card in the next lane.
4. Right-click a card, then ↓: the menu moves, the selection does not.
5. With the 세션 list open beside it, the inspector is fully visible (not cut
   off on the right).

## 3 · A project as a chronology
1. 프로젝트 → a project with confirmed sessions → 흐름.
2. Days run newest first; a long session sits on the day it last ran, with
   "M월 D일 시작". Quiet stretches read "N일 동안 활동 없음".
3. Only confirmed sessions appear; the summary line says how many unconfirmed
   ones were left out.

## 4 · The calendar and the way back
1. 캘린더 → a day with sessions → 세션 N건 unfolds them, grouped by confirmed
   project, then 프로젝트 확인 필요, then folder.
2. Open one. The header shows "← 캘린더 M월 D일". Click it: the calendar is
   back on that day, selected and unfolded.
3. Open a session whose transcript no longer exists (if you have one). It opens
   as its record, saying 원본 대화를 열 수 없습니다, with its period and PRs.

## 5 · What you kept, where you read it
1. Open a long session that shows "최근 대화 일부 표시 중".
2. 기록으로 남기기 on a message → save. Go back to the session: that message
   shows 남긴 기록; clicking it opens the record; its 원본 열기 returns.

## 6 · Truthful panels
1. 대시보드: the tile and table say 폴더, not 프로젝트.
2. Tool rows in a session read as 도구; an empty result is not shown as 나; a
   screenshot result reads "(이미지 N개)"; no colour codes like `[32m`.
3. Set 설정 → 내 요청 표시 수준 to 숨김: hovering a request
   in the timeline shows no request text. At 요약 or 요지 it shows that level's
   text (요약 is the first sentence), never the full original.

## Record the result
Write the date, the build, and pass or fail per step in the program ledger
(`~/mori-handoff/evidence-2026-10-10-renaissance/LEDGER.md`).
