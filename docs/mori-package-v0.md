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
  make it durable on the importing device. The import path (a future
  capability) re-enters these records for review, preserving the
  review-before-apply rule. Today the slice round-trips through
  serialize / deserialize; the review-on-import surface is the next
  step.
- The `auditTrail` slice (accepted-memory `ReviewAction` rows) is not
  carried yet — a later addition alongside the import-review surface.

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
```

Limitations:

- The exported file is currently `.mori.json`, not a real zip package.
- Raw source file folders are represented as metadata, not bundled files.
- Validation is structural and minimal. Full schema validation should be added before external import is trusted.
- Native file picker integration is not implemented yet.
