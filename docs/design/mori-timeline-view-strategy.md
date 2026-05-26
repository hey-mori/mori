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
