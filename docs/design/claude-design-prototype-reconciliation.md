# Claude Design prototype · reconciliation

A high-fidelity Claude Design prototype of Mori (v0.5, dated 2026.05.26)
was supplied as a **direction reference**, not production code. This note
records what the prototype is, what it gets right, what is already built
better in the real app, and, most importantly, what must **not** be
copied. Read it alongside [`mori-project-goal.md`](../mori-project-goal.md)
(canonical product direction) and [`mori-timeline-view-strategy.md`](mori-timeline-view-strategy.md).

## What the reference is

A standalone React-via-Babel prototype plus four companion HTML reports.
It lives on the author's machine (supplied from `~/Downloads/Mori/`); it is
**not vendored** into this repo because its load-bearing concepts are
already captured here:

- The signature concept screenshots were saved under
  `docs/assets/screenshots/` · `evidence-hub-reference.png`,
  `flow-focus-reference.png`, `narrative-timeline-reference.png`,
  `project-memory-reference.png`, and the connector / import set. They were
  removed from the tree on 2026-11-03 and remain in Git history; see
  [docs/assets/screenshots/README.md](../assets/screenshots/README.md).
- The prototype's own analysis docs (Developer Handoff, Priority Map,
  Timeline Explorations, Integration Model) are design essays, not specs.
  Their durable conclusions already live in our design docs.

Vendoring the ~550 KB of duplicate prototype JSX would add maintenance
surface without adding signal. If a future pass needs a frame the
screenshots do not capture, describe it in words rather than committing an
image of invented people or other products' logos.

## Audit verdict

**The shipped app is ahead of the prototype on every primary axis.** The
prototype is a flat mockup with placeholder data and decorative, non-functional
controls; the app is a tested, local-first system with a real data model,
review gates, and persistence. Treat the prototype as a mood-and-density
reference, not a target to port toward.

## Concept-by-concept reconciliation

| Concept | Prototype | Real app today | Verdict |
| --- | --- | --- | --- |
| **Session / work-context model** | A single "live session" with a stopwatch card pinned in the sidebar; sessions implicitly = AI chats. | Sessions are work units that are **imported / reconstructed / merged**, shown as a conversation-style list grouped by recency or project. No stopwatch. | App is correct. The prototype's stopwatch model is the *wrong* one (see [`mori-redesign-session-centric.md`](mori-redesign-session-centric.md)). **Do not copy.** |
| **Timeline** | Lanes × time with `+N more` clusters; one English-labelled mockup. | Density tiers (넓게 / 보통 / 조밀), named workflow bundles (no `+N more`), conversation-flow reading mode, narrow-width chrono list, minimap brush/zoom, gap markers, phase awareness, event + bundle inspectors. | App is well ahead. Borrow only *visual calm* cues. |
| **Source model** | AI-chat-centric vocabulary. | Generic source families + activity kinds (`activityModel.ts`) spanning AI, code, terminal, git, design, tracker, docs, research, build, deploy, automation, manual. | App is correct and broader. |
| **Connectors / capture** | Connector Control Center with toggles that look connected. | Explicit-import only (paste / file pick / desktop inbox refresh); honest planned/unavailable states; **no background watcher** (hard non-goal). | App is correct. The prototype's always-connected feel violates the local-first / explicit-capture principle. **Do not copy live toggles.** |
| **Notifications / alerts** | A generic notification feed. | Companion Inbox + `companionSignals` (read-only, evidence-based, routes to the responsible surface; never writes memory, never watches). | App is correct. Keep alerts as routed suggestions, not a noisy feed. |
| **Layout system** | Ad-hoc inline-styled screens. | Shared `PageShell` / `PageHeader` / `ActionBar` / `InspectorPanel` / `EmptyState` / `NoticeBanner` primitives + design tokens. | App is correct. |

## What is worth pulling forward

Narrow, additive ideas only · each must still pass the review-before-apply
and honest-status bars:

- **Cluster density micro-bars** · the prototype's bundle cards show a
  small per-minute density sparkline. Our bundles already exist; a calm,
  subordinate density glyph could be a future Timeline polish item.
- **Phase-band tone discipline** · the prototype keeps phase bands at very
  low opacity so they annotate without competing. Good guardrail to keep.
- **Story / thread reading of a session** · already reflected by the
  conversation-flow mode; the prototype's "Story" framing is a useful name
  for the Report-preview thread if/when that surface is built.

## What must not be copied

- The **stopwatch / always-live session** model.
- **Fake-connected** connector states and active buttons for unbuilt actions.
- **`+N more`** density collapse (we use named bundles).
- **English-only labels** on a Korean-first surface (this session removed
  the last timeline leak · see below).
- **Purple as a status color** (purple is identity only).
- Any **background-watch / always-on capture** affordance.

## Shipped from this reconciliation pass

- `fix: localize timeline source and trust labels to korean` · the timeline
  source-family / activity-kind / lane labels in `activityModel.ts` were
  still English (added by the recent source-aware-lanes work and never
  localized), and `timelineCards.ts` carried a duplicate English trust map.
  Both now read Korean from the single trust source. This removes the
  "half-finished mockup" tell on the product's signature surface.
