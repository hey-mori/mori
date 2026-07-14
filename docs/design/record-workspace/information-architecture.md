# Information architecture · 기록 Workspace

## 1. Alternatives compared

Three structures were designed and compared; the pre-redesign layout (flat
list + collapsible pickers) was not a candidate.

**A · Timeline ledger + context rail.** One journal timeline as the body.
The right rail is a single contextual slot: time context (mini calendar +
selected-day summary + week aggregates) when nothing is selected, record
inspector when a record is selected. AI 정리 is a state of the composer.
확인할 것 items form a strip above the feed. Zero screen switches.

**B · Inbox / Ledger split.** Unorganized input and the confirmed ledger as
two screens. Clear concept, but every capture costs a screen move, the inbox
becomes a guilt pile when unvisited, and it reverses Mori's consolidation
direction (the old standalone inbox surfaces were deliberately unified).

**C · One workspace + view switcher (타임라인/캘린더/테이블/패턴).**
Flexible, but reintroduces mode toggles the user has explicitly rejected,
and every view multiplies filter/selection state synchronization. Calendar
and patterns are densities of the ledger, not sibling modes.

| Criterion | A | B | C |
| --- | --- | --- | --- |
| Capture→save continuity | one screen | screen moves | breaks across views |
| Date UX placement | rail + strip, in-flow | isolated in inbox | calendar view only |
| Unresolved-item neglect risk | low (strip in body) | high | medium |
| Toggle minimalism (user feedback) | fits | fits | violates |
| Implementation risk | medium | medium | high (state sync) |

**Adopted: A**, absorbing B's inbox as the strip + resolution flow and C's
calendar as the expandable ledger calendar.

## 2. Layout relationships

```text
+------------------------------------------------------------------+
| action bar · 검색                                                 |
+------------------------------------------------------------------+
| Composer (idle: one line · reviewing: candidate cards)            |
| 확인할 것 N건 strip (conditional)                                  |
|                                                    | Context rail |
| Timeline (day-grouped, time-of-day rows)           |  time mode   |
|   7월 15일 오늘 · 업무 1                            |  mini cal    |
|   09:40-11:10 [업무] ...                            |  day summary |
|   7월 14일 어제 · ...                               |  week line   |
|                                                    |  (or)        |
|                                                    |  inspector   |
+------------------------------------------------------------------+
```

- **Composer ↔ timeline**: saving highlights the new rows in place; the
  placement is watched, not believed.
- **Rail ↔ timeline**: clicking a mini-calendar day scrolls/filters the
  timeline to that day and shows the day summary; selecting a record swaps
  the rail to the inspector.
- **Rail ↔ calendar**: the mini calendar expands into the ledger calendar
  (M4) as a body takeover with an explicit return affordance; selected day
  and selected record survive the round trip. Chosen over overlay or a
  separate route so the rail stays the single time anchor. (Final call per
  approved 5.4: body takeover within 기록, not a new nav destination.)
- **Strip ↔ resolution flow**: the strip opens M5 cards inline above the
  timeline; resolving all items removes the strip.

## 3. Context rail contract (approved refinement 5.2)

- The rail is in **time mode** iff no record is selected. The mode is
  labeled (선택한 날 / 이번 주 vs the record title), so the state is always
  legible.
- Selecting a record swaps rail content to the inspector with the record
  title as its header; deselecting (Esc, clicking empty space, or the
  inspector's close) returns to time mode **with the previous selected day
  intact**.
- Long or complex records do not cram into the rail: past a content
  threshold the inspector offers/opens the full detail view (M6).
- Returning from the expanded calendar restores both the selected day and
  any selected record.

### Narrow-width fallback

Below the two-column threshold (~1100px content width), the rail is not
rendered as a column:

- Time mode collapses into the strip row (calendar chip + selected-day chip).
- Record selection opens the inspector as a right drawer (overlay), Esc or
  scrim-click to dismiss; the timeline never reflows under it.
- The expanded calendar remains a body takeover at all widths.

## 4. What stays out

- No view tabs inside 기록. The tracker/aggregate lens is the rail week
  line + weekly review (R6), not a mode.
- No second workspace in the rail (inspector doctrine): the timeline must
  stand alone; the rail only contextualizes.
- No new top-level nav items: the ledger calendar and weekly review are
  reached from within 기록.
