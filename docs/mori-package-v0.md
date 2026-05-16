# `.mori` Package v0

Mori package v0 is currently implemented as a typed JSON package in memory and on export. It is intentionally shaped so it can later become a zip-like `.mori` file.

Implemented now:

- `createMoriPackageFromSession`
- `serializeMoriPackage`
- `deserializeMoriPackage`
- `validateMoriPackage`
- `exportMoriPackageAsJson`
- `importMoriPackageFromJson`
- `serializeEventsJsonl`
- Tauri desktop command for saving serialized `.mori v0 JSON`
- Tauri desktop command for opening JSON package contents from a path

- `getPackageConsolidatedMemories`
- `getPackageAuditTrail`

Current JSON shape:

```text
MoriPackageV0
  manifest
  projects
  sessions
  events
  issues
  decisions
  relationships
  sources
  nextActions
  artifacts
  summaries
  privacy
  theme
  consolidatedMemories?   (accepted project memory; optional, additive)
  auditTrail?             (memory review actions; optional, additive)
```

## Accepted project memory slice

`consolidatedMemories` carries the project's accepted (reviewed,
durable) project memory — `StoredAcceptedProjectMemory[]` — so
consolidated memory can travel with an exported `.mori v0` package.

- **Optional and additive.** The field is absent on packages
  exported before it existed. `deserializeMoriPackage` leaves it
  `undefined`; `getPackageConsolidatedMemories(pkg)` normalises both
  the absent and present cases to a list. No `formatVersion` bump is
  needed for an absent-safe additive field — each record carries its
  own `schemaVersion`.
- **Populated explicitly.** `createMoriPackageFromSession(session,
  { consolidatedMemories })` writes the slice; the Reports page
  `.mori v0` export reads the project's accepted memories from the
  repository and passes them in. With no option it defaults to `[]`.
- **Validation.** `validateMoriPackage` accepts an absent field and
  rejects a present non-array value.
- **No auto-merge on import.** Carrying memory in a package does not
  make it durable on the importing device. `buildImportedMemoryProposals`
  (`src/lib/project-memory/importedMemoryReview.ts`) converts the
  slice into reviewable proposals — deduplicated against the project's
  existing accepted memories — and `parseImportedMemoryProposals`
  wraps it for a raw package-JSON string. The Consolidation Review
  Surface has an **Import accepted memory from a .mori package** panel
  — paste the package JSON or pick a `.mori` file (browser `File` API,
  no Tauri command): imported memory enters the review list as
  proposals and only becomes durable through the normal accept /
  apply path.
## Memory Audit Trail slice

`auditTrail` carries the project's Memory Audit Trail review actions
— `StoredMemoryReviewAction[]` — so an exported `.mori v0` package
preserves not just accepted memory but the review history that
produced it.

- **Optional and additive.** Mirrors `consolidatedMemories` exactly.
  The field is absent on packages exported before it existed.
  `deserializeMoriPackage` leaves it `undefined`;
  `getPackageAuditTrail(pkg)` normalises both the absent and present
  cases to a list. No `formatVersion` bump is needed — each record
  carries its own `schemaVersion`.
- **Populated explicitly.** `createMoriPackageFromSession(session,
  { auditTrail })` writes the slice; the Reports page `.mori v0`
  export reads the project's review actions from the repository
  (`listMemoryReviewActions`) and passes them in. With no option it
  defaults to `[]`.
- **Validation.** `validateMoriPackage` accepts an absent field and
  rejects a present non-array value.
- **History, not writes.** These rows are review history. Importing a
  package never replays them — they travel so an exported package
  preserves the review history behind its accepted memory. `before`
  / `after` snapshots are carried only as the records already hold
  them; no extra raw content is exposed.

Future zip-like mapping:

```text
project.mori
  manifest.json
  projects.json
  sessions.json
  events.jsonl
  issues.json
  decisions.json
  relationships.json
  next_actions.json
  artifacts.json
  sources/
  summaries/
  privacy.json
  theme.json
  consolidated_memories.json
  audit_trail.json
```

Limitations:

- The exported file is currently `.mori.json`, not a real zip package.
- Raw source file folders are represented as metadata, not bundled files.
- Validation is structural and minimal. Full schema validation should be added before external import is trusted.
- Native file picker integration is not implemented yet.
