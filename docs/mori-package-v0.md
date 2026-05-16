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
- Tauri desktop command for saving via a native Save As dialog
  (`save_mori_package_json_as`)
- Tauri desktop command for saving a real `.mori` zip package via a
  native Save As dialog (`save_mori_package_zip_as`)
- Tauri desktop command for opening JSON package contents from a path
- Tauri desktop command for picking a `.mori` file via a native Open
  dialog (`pick_mori_package_file`)

- `getPackageConsolidatedMemories`
- `getPackageAuditTrail`
- `buildMoriPackageFileLayout`
- `parseMoriPackageFileLayout`
- `zipMoriPackage` / `unzipMoriPackage`

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
  — paste the package JSON or pick a `.mori` file (a native Open
  dialog on desktop via `pick_mori_package_file`, the browser `File`
  API otherwise): imported memory enters the review list as proposals
  and only becomes durable through the normal accept / apply path.
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

Zip-like file layout:

`buildMoriPackageFileLayout(pkg)` turns a `MoriPackageV0` into the
documented one-file-per-slice layout as an in-memory
`Record<MoriPackageFileName, string>`, and `parseMoriPackageFileLayout`
reassembles a validated `MoriPackageV0` from that map. This file
layout is the **canonical internal package layout**.
`parseMoriPackageFileLayout` throws on a missing file or an invalid
package, mirroring `deserializeMoriPackage`.

```text
project.mori
  manifest.json
  projects.json
  sessions.json
  events.jsonl
  issues.json
  decisions.json
  relationships.json
  sources.json
  next_actions.json
  artifacts.json
  summaries.json
  privacy.json
  theme.json
  consolidated_memories.json
  audit_trail.json
```

`events.jsonl` reuses `serializeEventsJsonl`; the optional
`consolidated_memories.json` / `audit_trail.json` are always present,
normalised to `[]` when the package predates those slices.

## Real zip package

`zipMoriPackage(pkg)` archives the canonical file layout into a real
`.mori` zip container (a `Uint8Array`); `unzipMoriPackage(bytes)`
reads it back. Zip is a **packaging layer**, not the source of truth —
it wraps `buildMoriPackageFileLayout` / `parseMoriPackageFileLayout`,
so `unzipMoriPackage` runs the same validation and per-record checks
as any other import. The zip codec is `fflate` — a small,
dependency-free, pure-JS library: no native code, no network.
`unzipMoriPackage` throws on a corrupt archive or a missing required
file.

The Reports `.mori` export writes a real zip package: `zipMoriPackage`
produces the archive, the desktop `save_mori_package_zip_as` command
writes it to a user-chosen `.mori` file via the native Save As
dialog, and the browser downloads the zip blob. Wiring the import
panel to read a zip package is the follow-up slice.

Limitations:

- The Reports `.mori` export writes a real zip package. The import
  panel still reads JSON / pasted package text — wiring zip import is
  the next slice — so a zip exported now is not yet re-importable
  through the UI until that lands.
- Raw source file folders are represented as metadata, not bundled files.
- `validateMoriPackage` checks the manifest, that each slice is an
  array of objects carrying their identity fields (`id`, and `type`
  for events), and the privacy / theme blocks. It is deterministic
  and dependency-free; deeper field-level schema validation can still
  be layered on before fully trusting arbitrary external packages.
- The desktop export uses a native Save As dialog
  (`save_mori_package_zip_as`) and the Consolidation Review import
  panel uses a native Open dialog (`pick_mori_package_file`) on
  desktop; the browser keeps the blob download / `File`-pick paths.
