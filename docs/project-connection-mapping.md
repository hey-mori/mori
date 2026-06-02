# Project Connection Mapping

Status: **Foundation implemented; confirmation UI planned.**

This document records the project-identity and connection-mapping layer that
backs the [Live Project Intelligence](./live-project-intelligence.md) track's
`ConnectedProject` object. It is honest about what is in code today versus what
is still designed.

Related canonical docs:

- [Live Project Intelligence](./live-project-intelligence.md) for the Signal /
  Summary / Trace thesis and the `ConnectedProject` concept this realises.
- [Mori Project Goal](./mori-project-goal.md) for the review-before-apply and
  "automatic collection is not automatic application" principles.

## Problem

Mori groups every session that shares a project under one project page, and the
Live Project Intelligence track wants to associate external AI sessions
(Claude / Codex / OpenCode work discovered by their connectors) with the right
Mori project. Both jobs need one honest answer to "are these two project labels
the same project?".

Historically that answer drifted across the codebase:

- `buildProjectOverview` compared raw `sourceLabel`s with a trim-only equality.
- `ProjectView` resolved a project id with `trim().toLowerCase()`.
- `session/projectIdentity` and `association/evidenceAssociation` each carried
  their own path normaliser.

So `C:\dev\mori`, `C:/dev/mori/`, and `c:/dev/mori` could land in three separate
project buckets even though they are one project, and a short name like `mori`
never reconciled with the full path `/Users/x/dev/mori`.

## What shipped

The single canonical primitive lives in
[`src/lib/projects/projectConnection.ts`](../src/lib/projects/projectConnection.ts).

- **Canonical identity.** `normalizeProjectIdentity` turns a raw path / label
  into a comparable identity: separators unified to `/`, trailing slashes
  stripped, key lower-cased, a display label that preserves the trailing
  segment's original casing. Pure and deterministic, no filesystem and no
  home-directory guessing.
- **Match strength.** `compareProjectIdentities` returns `exact`, `basename`,
  or `none`. `projectIdentitiesMatch` is the strict "same project" predicate
  used for auto-grouping.
- **Auto-grouping fix.** `buildProjectOverview` and the `ProjectView` durable
  memory resolver now group by canonical identity, so separator / case /
  trailing-slash variants stop splitting into separate projects, and grouping
  agrees with which project owns durable memory.
- **Connection mapping.** A user-confirmed `ConnectedProject` alias record maps
  extra labels onto one project. `buildProjectConnectionCandidates` proposes
  `basename` near-matches as reviewable candidates; `projectMatchesWithAliases`
  resolves membership through confirmed aliases; `buildProjectOverview` accepts
  an `aliases` list and groups confirmed labels in.
- **Persistence.** `loadConnectedProjects` / `saveConnectedProjects` keep the
  mappings in schema-versioned localStorage (`mori.projectConnections.v1`), with
  pure `addProjectAlias` / `removeProjectAlias` transforms.

## Data model

```text
ConnectedProject
  projectKey   the Mori project key its primary sessions share
  aliases[]    other raw labels the user confirmed are the same project
  createdAt / updatedAt

ProjectConnectionCandidate
  canonicalKey / label / displayLabel
  strength     basename (only near-matches become candidates)
  confidence   low
  sourceIds[] / count / sampleTitle
```

This is the minimal first cut of the Live Project Intelligence `ConnectedProject`
object. The richer fields in that spec (`connectionStatus`, `captureMode`,
`allowedConnectorIds`, `projectPathHash`, `rawDataPolicy`) are deliberately
deferred until the live-capture slices need them; an alias mapping is the part
that earns its keep today.

## Matching rules

| Strength | Meaning | Auto-group? |
|---|---|---|
| `exact` | the same project written differently (case / separator / trailing slash) | yes |
| `basename` | the same trailing segment under a different path (`mori` vs `/Users/x/dev/mori`) | no, candidate only |
| `none` | no usable match | no |

A `basename` match is never auto-grouped because two unrelated projects can
share a trailing name (`/work/api` vs `/play/api`). It becomes a reviewable
candidate instead.

## Review-before-apply boundary

The connection mapping is the trust boundary the Live Project Intelligence
technical review asked for: do not trust raw paths or `sourceLabel` alone.

- Mori may *propose* a look-alike label as a candidate.
- Only when the user *confirms* does the label become an alias that changes how
  sessions group or which project owns durable memory.

This keeps "automatic collection is not automatic application": Mori can surface
look-alike work, but the durable grouping change still rides an explicit
confirmation.

## Remaining slices

1. **Project-page candidates UI.** Surface `buildProjectConnectionCandidates`
   on the project workspace: list look-alike labels with session counts, a
   confirm action (writes an alias), and a remove action for confirmed aliases.
   Best built once the concurrent project-page state-strip work settles, to keep
   the two efforts from contending for `ProjectView`.
2. **Desktop external-session linking.** Feed discovered `AgentWorkSessionMeta`
   (Claude / Codex / OpenCode work) through the same matcher so a connected
   project can show its not-yet-imported external AI sessions, honouring the
   refresh-only, no-background-watcher boundary.
3. **Workspace de-duplication.** The all-projects browser still lists
   `basename` near-matches as separate projects; once aliases exist it can fold
   confirmed ones together.
4. **Richer `ConnectedProject` fields.** Add `captureMode` / `connectionStatus`
   / `allowedConnectorIds` when the live-capture and status slices need them.

## Validation

- [`src/lib/projects/projectConnection.test.ts`](../src/lib/projects/projectConnection.test.ts)
  covers identity normalisation, match strength, alias resolution, candidate
  proposals, and the alias add / remove transforms.
- [`src/lib/project/projectOverview.test.ts`](../src/lib/project/projectOverview.test.ts)
  covers canonical grouping of separator / case / trailing-slash variants, alias
  grouping, and the refusal to merge a different project that only shares a
  trailing name.
