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
```

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
