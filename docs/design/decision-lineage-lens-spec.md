# 계보 · Decision Lineage Lens (component + data spec)

A buildable spec for the planned fifth lens of the 재구성 lab. It turns the
session's decisions, the richest and most under-used data Mori owns, into a
scannable, ADR/IBIS-shaped reading. Pure derivation from `MockSession`, zero
coupling, fully testable.

**Status: implemented.** Shipped as `buildDecisionLineage` + `DecisionLineageView`,
wired as the fifth 재구성 lens. The card anatomy, rejected alternatives,
motivations/consequences, and the predicted-vs-actual block all shipped. Deferred
follow-ups: the left-to-right lineage chain rail for decision-to-decision edges
(§3), and the peek/focus interactions (§5), which wait on the shared peek
primitive.

Parent: [`reconstruction-lab-vision.md`](reconstruction-lab-vision.md) (§4.5).
Visual rules: [`visual-system-direction.md`](visual-system-direction.md).
Interaction: [`interaction-navigation-model.md`](interaction-navigation-model.md).

---

## 1. Why this lens

The lab currently shows a decision as a title chip with its rationale in a
tooltip. The `Decision` type carries far more: `decision` (the chosen path,
distinct from the title), `rejectedOptions[]`, `impact[]`, `relatedIssueIds`,
`sourceEventIds`, `importance`, `trustLevel`, `confirmed`. Every ADR reference
agrees the most valuable part of a decision is the *rejected alternatives* and
the *consequences*, and Mori is one of the few tools that owns the whole session
history, so it can also show *predicted vs actual*. 계보 is the lens that reads
"why did we decide what we decided, and what followed."

---

## 2. Data model (pure helper)

```
buildDecisionLineage(view: MockSession): DecisionLineage
```

```ts
type LineageStatus = "confirmed" | "proposed" | "contradicted";

type LineageRef = {            // a motivation or a consequence pointer
  kind: "event" | "issue" | "decision" | "artifact";
  id: string;
  label: string;               // title, for display
  reason: string | null;       // the relationship.reason, when it came via one
};

type LineageDecisionCard = {
  id: string;
  title: string;
  decision: string;            // the chosen path
  rationale: string;
  rejectedOptions: string[];
  impact: string[];            // stated (predicted) consequences
  importance: Priority;
  trustLevel: TrustLevel;
  status: LineageStatus;       // confirmed | proposed (!confirmed) | contradicted
  motivations: LineageRef[];   // what led INTO this decision
  consequences: LineageRef[];  // what this decision led TO (downstream)
  predictedVsActual: {
    predicted: string[];       // = impact
    actual: LineageRef[];      // downstream events/artifacts/issues, derived
  } | null;                    // null when there is nothing honest to compare
};

type LineageEdge = {           // decision -> decision links only
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;      // influencedDecision | contradicted | ...
  tone: ActivityTone;          // contradicted => red (tension); else blue
};

type DecisionLineage = {
  cards: LineageDecisionCard[];   // importance-desc, then chronological
  edges: LineageEdge[];           // for the lineage chain rail
  hasChain: boolean;              // any decision->decision edge exists
};
```

Derivation rules (all pure, deterministic, no clock/LLM):

- **status:** `confirmed` from `Decision.confirmed`; if a `contradicted`
  relationship touches the decision, `contradicted` wins; else `proposed`.
- **motivations:** the decision's `relatedIssueIds` (issues), `sourceEventIds`
  (events), plus any relationship whose `toType === "decision"` and
  `toId === decision.id` (incoming `influencedDecision` / `caused` / `ledTo`),
  carrying that relationship's `reason`.
- **consequences:** any relationship whose `fromType === "decision"` and
  `fromId === decision.id` (outgoing `ledTo` / `caused` / `producedArtifact` /
  `createdIssue` / `resolvedIssue`), resolved to the target's label.
- **predictedVsActual:** `predicted = impact`; `actual` = the consequence refs
  that are events/artifacts/issues. Render the slot only when both
  `impact.length > 0` and `actual.length > 0`. Never claim a match
  algorithmically (no semantic comparison, that would overclaim); present both
  columns and let the user judge. This is the honesty line.
- **edges:** relationships where both endpoints are decisions. `contradicted`
  is toned red (a tension); others blue.
- **ordering:** importance desc, then `createdAt` asc, stable.

---

## 3. Component anatomy

`DecisionLineageView({ view, focusedId?, onFocus?, onPeek? })`, rendered like the
other lenses from `filtered` in `TimelineLabView`.

Each card, top to bottom (ADR/IBIS-compact, copy-diet):

```
┌────────────────────────────────────────────────┐
│ ● 결정 제목                      [중요]  trust   │   status dot + title + importance + trust marker
│ 맥락: 이슈 "토큰 만료" 외 1건에서 비롯됨          │   motivations summary (one line)
│ 결정 → 리프레시 토큰 회전 도입                    │   the chosen path (decision)
│ 근거: …(한 줄, 길면 InfoHint)                     │   rationale
│ 기각  24h 고정 만료   ·   기각  세션 무효화        │   rejectedOptions as muted 기각 chips
│ 영향: 보안 강화 · 통합 테스트 필요                │   impact (predicted)
│ 예상 vs 실제   [예상 2]  →  [실제: 이슈 1 · 산출물 1] │  predictedVsActual, only when honest
└────────────────────────────────────────────────┘
```

- **Lineage chain rail.** When `hasChain`, render decision-to-decision edges as
  a simple left→right connector strip above/beside the cards (A 영향→ B), never
  a free graph. `contradicted` edges read as a red tension link.
- **Motivations / consequences** are click targets that open a **peek** (Move B,
  the interaction model) on the linked issue/event/artifact, not a jump away.
- **Empty state:** lavender chip, "아직 기록된 결정이 없습니다." (no hard sell).

---

## 4. Visual treatment (per the encoding ladder)

Color is last; meaning is carried by weight/shape first (visual system §4):

- **Importance:** pivotal decisions get a heavier title and full card; low ones
  are quieter. Not a new color.
- **Trust:** verified = solid border + full opacity; observed = lighter;
  inferred = dashed border. Identical to the trust encoding used in 서사 / 인과.
- **Status:** a single calm dot in decision-blue, filled = confirmed, hollow =
  proposed. `contradicted` uses the semantic red dot (a real tension). No new
  hue, no left-accent bar, no purple.
- **Rejected options:** muted text with a small 기각 tag; never struck-through
  red (rejection is not an error).
- **predictedVsActual:** two quiet columns; no verdict styling, no checkmarks.

---

## 5. Interaction

- Selecting a card sets the lab's **surface-local focused subject**
  (`{type:"decision", id}`); switching lens keeps it focused (서사 scrolls to
  its moment, 인과 centers it). This is the lab vision §4.0 / interaction §3.
- Motivation/consequence chips **peek** their target.
- A secondary "흐름에서 보기" affordance on a card is allowed (Move A deep-link)
  but never the default click.

---

## 6. Honesty and edge cases

- A decision with no motivations and no consequences still renders (title +
  decision + rationale); the relational rows simply omit.
- `predictedVsActual` is suppressed unless there is real downstream data. No
  invented outcomes.
- `inferred` decisions read as dashed and never present as settled fact
  (matches the product principle that AI interpretation is a proposal).
- Deterministic ordering so the view is stable across renders and snapshots.

---

## 7. Test plan (colocated `buildDecisionLineage` tests)

- motivations resolve from `relatedIssueIds` + `sourceEventIds` + incoming
  relationships, deduped.
- consequences resolve from outgoing relationships only.
- `predictedVsActual` present when impact and downstream both exist; null
  otherwise (both empty-impact and no-downstream cases).
- status precedence: contradicted > confirmed-flag > proposed.
- edges include only decision-to-decision relationships; `contradicted` toned
  red.
- ordering: importance desc then createdAt asc, stable.
- empty session yields empty `cards`, `hasChain: false`.

No screenshot tests (per repo policy); the view is thin over a tested model.

---

## 8. Open questions

- **Chain semantics:** the relationship vocabulary has no explicit
  `supersededBy`. Do we treat `influencedDecision` between two decisions as the
  lineage edge, or also fold `mergedInto` / `splitFrom`? (Start with
  decision-to-decision of any type, tone by type.)
- **Grouping:** order purely by importance+time (recommended), or group
  confirmed vs proposed into sections?
- **predictedVsActual depth:** columns only now; a later pass could let the user
  annotate "as predicted / diverged" as a reviewed note (which would touch
  persistence, so out of the pure-lens scope).
