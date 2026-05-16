# Team / Shared Memory — Specification

This document specifies how Mori could support **team / shared
memory** without breaking its local-first and privacy principles. It
is a **specification**, not an implementation plan for sync — there is
no cloud sync, no account system, no permissions backend, and no
remote collaboration service in Mori, and this spec does not introduce
any. It is grounded in primitives that already exist
(`docs/mori-package-v0.md`, `docs/project-memory-consolidation.md`).

## 1. Principle

Sharing memory between people is a **package handoff**, not a live
sync. One person exports a `.mori` package; another person imports it
through the normal review path. Nothing about shared memory bypasses
review, and nothing uploads automatically.

The hard non-goals hold without exception:

- No cloud sync — sharing is an explicit file handoff.
- No account system, no permissions backend, no remote service.
- No shared memory writes without review — imported memory always
  enters Consolidation Review as proposals.
- No hidden upload, no background transfer.

## 2. The sharing primitive: explicit `.mori` package handoff

The `.mori` package is already the unit of portable memory:

- Export — the Reports page writes a real `.mori` zip
  (`zipMoriPackage`); it carries the `consolidatedMemories` slice
  (accepted project memory) and the `auditTrail` slice (the review
  history that produced it).
- Import — the Consolidation Review panel reads a `.mori` package
  (`parseImportedMemoryProposalsFromZip` / `parseImportedMemoryProposals`)
  and turns its accepted memory into reviewable proposals via
  `buildImportedMemoryProposals`.

Team memory is this same round trip between two people:

```
Person A: accepted memory  →  Reports → export .mori
                           →  (hand the file over: email, drive, repo)
Person B: import .mori     →  Consolidation Review proposals
                           →  accept / edit / discard
                           →  Person B's accepted memory
```

No new transport is required for the first version. "Handing the file
over" is out of Mori's scope — Mori produces and consumes the file.

## 3. Roles

Mori is single-user today; roles are **named for the future**, not
implemented as accounts. They describe intent, not enforced
permissions.

| Role | Meaning | Today |
|---|---|---|
| Author | Produced the accepted memory; exports the package | the local user |
| Reviewer | Imports a package and decides what to accept | the local user |
| Recipient | Reads a client-safe package as a report artifact | not a Mori user |

`StoredAcceptedProjectMemory.acceptedBy` is already the literal
`"local-user"` and `StoredMemoryReviewAction.actor` is `"local-user"`
— reserved seams for a future named actor. A real multi-actor model
would only ever annotate provenance; it would never grant a remote
party write access to local memory.

## 4. Privacy boundaries

Two fields already on every accepted memory are the privacy spine of
shared memory — a shared package must honour both:

- `sensitivity`: `normal` | `sensitive` | `clientSafeExcluded`.
- `reportEligibility`: `excluded` | `personal` | `team` | `clientSafe`,
  ranked `0 < 1 < 2 < 3` (`MEMORY_REPORT_ELIGIBILITY_RANK` in
  `reportBuilder.ts`).

An audience tier is satisfied when a memory's `reportEligibility` rank
is **at least** the tier's rank. This is the same gate the Reports
page already applies; shared memory reuses it rather than inventing a
parallel notion.

| Share audience | Minimum `reportEligibility` | Excludes |
|---|---|---|
| Personal handoff (your own devices) | `personal` (1) | `excluded` |
| Team handoff (trusted teammates) | `team` (2) | `excluded`, `personal` |
| Client-safe handoff | `clientSafe` (3) | everything below `clientSafe`, plus `sensitivity` filtering |

## 5. Client-safe export rules

A **client-safe `.mori` package** is a package an Author can hand to a
non-teammate. It is a filtered package, produced by the Author with
explicit intent — never a default.

A client-safe package:

- includes only accepted memories whose `reportEligibility` is
  `clientSafe`;
- excludes any memory with `sensitivity` of `sensitive` or
  `clientSafeExcluded`, regardless of `reportEligibility`;
- carries the `auditTrail` slice **only** for the included memories
  (review history for excluded memories is dropped);
- never carries raw connector JSONL, transcripts, or local paths —
  the package format already holds none of these;
- records on its manifest that it is a client-safe export, so an
  importer can see the package was filtered.

The client-safe filter is implemented as `buildClientSafeMoriPackage`
(`src/lib/mori-package/clientSafe.ts`) — a pure `MoriPackageV0` →
`MoriPackageV0` transform that composes with `zipMoriPackage`. It
marks the manifest `clientSafeExport: true`; `getPackageIsClientSafe`
reads the marker. The Reports `.mori` package strip exposes it as a
"client-safe export" action.

## 6. Conflict and duplicate review model

When Person B imports a package whose memory overlaps what they
already hold, Mori must resolve it **through review**, never by
silent merge. The dedup logic already exists in
`buildImportedMemoryProposals`:

- **Origin match** — an imported memory whose `originProposalIds`
  overlap an existing accepted memory is skipped as
  `duplicate-origin`.
- **Title match** — an imported memory sharing a normalised title
  with an existing memory of the same kind is skipped as
  `duplicate-title`.
- **In-batch match** — a package that lists the same memory twice
  yields one proposal.

Skips are reported honestly in the import summary. What is **not**
yet modelled, and is reserved for a later slice:

- **Divergence** — same origin / title, *different* summary or status
  (e.g. Person A marked a decision `stale`, Person B still holds it
  `accepted`). The intended resolution is a `contradiction`-style
  review proposal citing both sides, surfaced in Consolidation
  Review — never an automatic overwrite.
- **Merge provenance** — when an imported memory is accepted, its
  originating package id is already recorded on the proposal
  rationale; a future slice may also carry the source `auditTrail`
  rows as read-only history.

## 7. Handoff workflow

A handoff is the end-to-end flow two people follow to share memory.
It is entirely explicit; Mori produces and consumes the file but does
not move it.

### Author — export

1. Open the **Reports** page. The `.mori` package strip offers two
   export actions.
2. Choose the audience:
   - **`.mori 패키지 내보내기`** (normal export) — the full package:
     every accepted memory and the whole audit trail. For your own
     devices or fully trusted teammates.
   - **`클라이언트 공유용 .mori 내보내기`** (client-safe export) — runs
     `buildClientSafeMoriPackage`: only `clientSafe`, non-sensitive
     memory, audit rows for surviving memory, manifest flagged
     `clientSafeExport`. For a non-teammate. The strip reports how
     many memories were kept vs dropped — confirm that before you
     send the file.
3. The file is written: on desktop via a native Save As dialog (a
   `.mori` zip; client-safe gets a `-client-safe.mori` suffix); in the
   browser as a download.
4. **Transfer is out of Mori's scope.** Hand the file over however
   you already share files — email, a shared drive, a repo. Mori
   never uploads it.

### Reviewer — import

1. Open **Project Memory → Consolidation Review**. The **Import
   accepted memory from a .mori package** panel takes a pasted
   package or a picked `.mori` file (native Open dialog on desktop,
   `File` picker in the browser).
2. The package's accepted memory becomes **review proposals** — it is
   never merged automatically. Memory the project already holds is
   skipped (origin / title dedup) and the skips are reported. If the
   package was a **client-safe export**, the panel says so — the
   Reviewer knows the handoff may be partial.
3. Review each proposal: accept, edit, or discard. Only accepted
   proposals become the Reviewer's durable accepted memory, through
   the normal apply path with its audit row.

### What does not happen

- No auto-merge — imported memory is always proposals first.
- No sync — there is no live channel; a second handoff is a second
  file.
- The Reviewer's accepted memory is theirs alone. It does not flow
  back to the Author unless the Reviewer themselves exports a new
  `.mori` package.

## 8. Later-implementation backlog

In dependency order; each is a separate future slice, none implies
sync:

1. Client-safe package filter — **shipped** as
   `buildClientSafeMoriPackage` (pure `MoriPackageV0` →
   `MoriPackageV0` transform + a `clientSafeExport` manifest flag).
2. Client-safe export UI — **shipped** as the Reports `.mori` package
   strip's "클라이언트 공유용 .mori 내보내기" action, which runs the
   filter before `zipMoriPackage` and reports kept / dropped counts.
3. `.mori` handoff workflow — **shipped** as §7 above (the explicit
   Author export → transfer → Reviewer import walkthrough).
4. Divergence review — a `contradiction`-style proposal when an
   imported memory conflicts with an existing one.
5. Imported `auditTrail` as read-only provenance on accepted memory.
6. Named-actor provenance — populate `acceptedBy` / `actor` with a
   local, user-set identity (still no accounts, still local-first).

## 9. Hard non-goals (restated)

Team / shared memory must never introduce:

- cloud sync by default, or any always-on sync;
- an account system, OAuth, or external account reading;
- a permissions / authorization backend;
- a remote collaboration service;
- shared memory writes that skip Consolidation Review;
- hidden upload or background transfer of any kind.

Shared memory is, and remains, an explicit `.mori` package handoff
reviewed on import.
