# Time and placement UX · the three-time model in user language

Kernel truth (architecture §3.3): every record carries
`occurredStart/occurredEnd`, `sourceCreatedAt`, `capturedAt`, a `timeBasis`
(`source-exact / source-observed / user-provided / ai-inferred /
capture-fallback / unknown`), and a time confidence. None of these words
reach the screen; each state gets one user sentence.

## 1. Translation table

| Kernel state | User label | Row/detail example | Affordance |
| --- | --- | --- | --- |
| `source-exact` / `user-provided` | none (plain date) | 7월 14일 18:25 | none |
| `ai-inferred` | 추정 (orange) | 7월 14일로 추정 · 근거 "어제" | one tap: 확정 / 수정 |
| `source-observed` | 원본 날짜 | 원본 7월 12일 · Mori에 추가 7월 15일 | choose which is the activity date |
| `capture-fallback` | 입력일 기준 | 입력한 날(7월 15일)로 표시 중 | set the real activity date |
| future `occurredStart` | 예정 | 7월 18일 예정 | convert to done on completion |
| `unknown` | 날짜 미정 | in the 확인할 것 strip, never a fabricated date | resolution flow below |

Rules: 추정 is never rendered like a confirmed date (distinct color +
label); `unknown` is a first-class state, allowed to stay (an insight needs
no date); dates are never silently invented.

## 2. Resolution flow (R4 · M5)

Entry: the 확인할 것 strip ("날짜를 확인할 기록 N건") above the timeline;
also per-row 추정 chips.

Each card leads with the reason, then offers context-fit choices:

- No date anywhere: [입력일 M/D로] [오늘] [날짜 선택…] [날짜 없이 유지]
- Late-night capture: [M/D (전날)] [M/D (입력일)] [날짜 선택…] [유지]
- Inference with evidence: 근거 quoted → [추정대로 M/D] [날짜 선택…] [유지]
- Source has its own date: [원본 날짜로] [입력일로] [날짜 선택…]

A repeated identical choice (e.g. 새벽 입력 → 전날, three times) generates a
personalization rule proposal; accepted rules apply silently afterwards and
are visible in settings (kernel `Rule` rows).

## 3. Calendar placement semantics (R5 · M4)

- Cells show the ledger: kind-colored marks, one or two leading titles,
  +N more, planned entries as outlined (not filled) marks.
- Selecting a day opens that day's agenda in the rail: counts by kind, rows
  in time order, date-unknown rows marked 추정/미정.
- The 날짜 미정 tray sits under the grid; dragging an item onto a cell
  assigns its **activity date** (`user-provided`); dropping with the
  modifier key (⌥) sets a **scheduled date** instead. On drop the row shows
  which one happened.
- Moving an existing record to another day asks the same question when
  ambiguous (활동일 변경 vs 예정일 설정), one-tap answers.
- Drag has a full keyboard/click fallback: every tray item and cell action
  is reachable via the card flow (§2) and a 날짜 선택 menu; drag is an
  accelerator, never the only path.
- Month/week zoom: month shows density + leading titles; week adds a time
  axis. Empty weeks compress; giant empty cells are a defect.

## 4. Placement feedback after save

Saving from review highlights the new rows in the timeline at their
activity dates and increments the rail mini-calendar dots in the same
frame. If the activity date differs from today (e.g. 어제 기록), the
highlight happens under yesterday's day header, making the distinction
between capture time and activity time visible at the moment it matters.
