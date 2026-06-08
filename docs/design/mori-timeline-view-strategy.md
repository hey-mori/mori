# Mori Timeline View Strategy

This note records the current safe implementation slice for the Timeline /
Flow surface. It is not a broad redesign brief; it explains how the broader
work-memory model is now made visible without changing persistence.

## Reference Input

No attached concept image was present for this pass. If a future Mori timeline
concept image is attached, save it under:

`docs/assets/mori-ui-references/timeline-advanced-views-reference.png`

Useful ideas to preserve from the current direction:

- Compact indexed activity blocks, not oversized feed cards.
- A calm lane system that can represent AI, code, git, terminal, research,
  design, tracker, docs, build/deploy, automation, notes, memory, and handoff
  work.
- Progressive disclosure: row/card first, inspector for provenance and
  detailed metadata.
- Evidence chips stay compact; detailed provenance stays in the inspector.
- Density modes change how much metadata is visible.

Ideas not to copy blindly:

- A full Gantt or kanban board. Mori is reconstructing work, not assigning
  project-management state.
- Decorative timelines or chart-heavy overview panels.
- Fake lanes for sources that are not present in the session.
- A project registry UI before canonical project identity exists.

## Modes

Appropriate now:

- Timeline mode: normalized activity lanes over a real time axis.
- Flow mode: a chronological reconstruction where conversation turns remain
  one activity type among broader work events.
- Inspector: the detail surface for source family, activity kind, trust,
  retention, work-context hint, evidence, review links, and notes.

Planned:

- Cluster/phase markers beyond the existing burst and gap markers.
- Relationship map / source-to-timeline mapping.
- Review-board or milestone/outcome modes.
- Real project registry with stable `projectId` ownership beyond hints.

## Implemented Safe Slice

This pass introduces a pure normalized activity layer:

- `sourceFamily` derives broad source families from existing `SourceRef.kind`.
- `activityKind` derives generic work activity from event type, actor, text,
  and linked source refs.
- Timeline lanes are now derived from `activityKind` / `sourceFamily`, not
  persisted event-type lanes.
- Event cards, chronological rows, minimap dots, Flow cards, bundle
  inspectors, and event inspectors use the same normalized visuals.
- Project identity remains a hint view model. It prefers `session.sourceLabel`,
  repository/source URI, path-like source detail, source title, then
  `session.projectId`. No migration is performed.

Future path:

- Promote project hints into a reviewed project registry.
- Add source-to-event relationship mapping for commits, design frames, issues,
  docs, and URLs.
- Add phase clustering and outcome/milestone summaries once real mixed-source
  sessions expose the right grouping pressure.

## Two altitudes: scan and read (direction, deferred)

User direction (2026-06-08), prompted by comparing the swimlane 흐름 view with
the Workbench message feed. The same work-memory model deserves two reading
altitudes, not two separate timelines:

- **Scan altitude** (today's 흐름 swimlane): when and in what shape the work
  flowed, density and rhythm over the time axis. Calm, compact, bundled.
- **Read altitude** (the Workbench-style linear feed): what actually happened,
  message by message, with the real tool calls / files / prose. Content-first.

Key realisation: the read altitude already has a seed. The 흐름 toolbar already
offers `타임라인 | 목록 | 연결`. So the path is to **grow the `목록` mode into a
strong read altitude and unify it with the Workbench feed**, not to add a third
view. One model, two altitudes; the user picks by intent (scan vs read) and by
situation (calm overview vs a big readable trace).

Hard parts, deliberately deferred until designed properly (getting these wrong
makes the surface worse, not better):

1. **Workbench ↔ Timeline unification.** Both are projections of the same
   session model at different altitudes; they should share one source of truth,
   not diverge into two feeds.
2. **Real time.** New events arrive while either altitude is open; both must
   update smoothly (slide-in / settle, no jarring reflow, no fake spinners).
   Builds on the foreground Live Follow already specified.
3. **Default altitude + switch UX.** Which altitude leads, per person and per
   situation, and how switching preserves focus / scroll position.

Smaller, safe steps that move toward this without the hard architecture:

- Enrich the `목록` (read) mode with the per-turn provenance already captured
  (`event.fileTouches`): a compact "this turn touched X · +N -M" line, so the
  read altitude shows what each turn did, closer to the Workbench feed.
- Make actor (user / assistant / tool) legible at a glance in the read mode.

Not now: a brand-new third view, a Gantt/kanban board, or a real-time engine
rebuild. Capture pressure from real mixed-source sessions first.
