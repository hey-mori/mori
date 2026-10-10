# Product Renaissance · roadmap

The product direction that came out of the 2026-10-10 program. This is not the
execution record (that is [`README.md`](README.md)): it is what Mori should do
next, why, and which of it waits on an owner decision. Each item names what a
wrong call would cost, so the order can be argued with.

## Where Mori stands

The record kernel, reviewed membership and the integrity work make Mori
trustworthy about **what happened and where it belongs**. This program made
that legible: a long session reads as a labelled timeline, a project reads as
a chronology of confirmed work, the calendar opens into its sessions and leads
back, and what a person kept from a conversation is visible where they read it.

What still costs the operator time, in order:

1. Surfaces that say something Mori does not know (decorative panels, labels
   that predate membership).
2. Finding the right session when many look alike (scripted runs with one
   prompt, folder names reused across machines).
3. Turning what was learned in a session into something reused next time
   (records exist; reuse is still manual).

## Decisions waiting on the owner

These change what the product promises, so they are not taken unilaterally
(CLAUDE.md autonomy grades). Each has a recommendation.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Does request disclosure gate **titles**, or bodies only? (#237) | (a) titles follow the level; (b) bodies only, documented; (c) only 숨김 gates titles | (c): 숨김 is the level that promises "not shown"; 요약 and 요지 keep scanable titles. Today the first 90 characters of a request show at every level. |
| D2 | The dashboard: regroup or retire? | (a) group by reviewed project with a 폴더 fallback; (b) unwire from the sidebar, keep it reachable from the palette | (a) if usage per project matters to you; otherwise (b). Its copy is truthful since #250, but it duplicates the project page. |
| D3 | Work graph and workbench: keep in the sidebar? | keep; unwire (retire-don't-delete) | Unwire both from the sidebar, keep palette routes. Neither answers a question the project page or the calendar does not answer better. |
| D4 | A session active across many days: which calendar days show it? | start day only (today); start and last-activity days; every active day | Start and last-activity days, the later one marked "M월 D일 시작", matching the chronology. Every day would invent activity on quiet days. |
| D5 | The reconstruction lab (unwired in fc790f60) | keep retired; bring one lens back into 분석 | Keep retired until a lens answers a concrete question the timeline cannot. |
| D6 | Home | command canvas (current); continuation landing (retired) | Keep the canvas; this program found no evidence against it. |

A transcript lost to Claude Code's cleanup during the program is not a product
gap to decide on: Home already lists conversations near or past their
estimated cleanup and routes to 원본 보관 (the retention program). Copying a
real transcript stays the operator's call.

## Next work that needs no new decision

Grade-one work, in recommended order.

1. **Distinguish look-alike sessions.** Several real sessions share one title
   (scripted runs). Show the first differing word of the prompt or the start
   time beside duplicates in lists, never a guessed label.
2. **Record list snippets.** A passage kept from a markdown reply shows "##" in
   the 기록 list and body; render the snippet as text.
3. **Session list and lost sources.** A session whose transcript is gone is
   absent from the 세션 search but present in the calendar; make the 세션 list
   show it with the same "원본 대화를 열 수 없습니다" state (#251 covers the
   record).
4. **Reuse at the start of work.** When a session opens in a project, show the
   project's most recent decisions kept from earlier sessions (read-only, from
   records the user already made). This is reuse of accepted records, not new
   memory.

## Not planned

Anything on the program's separate-approval list: new capture defaults,
background surveillance, sending private data out, automatic acceptance of AI
memories, destructive migrations, cloud sync, accounts, releases.
