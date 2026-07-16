# Kernel integrity + extensibility review · promises vs code

Status: **audit + recommendations, 2026-07-15, HEAD ~`9676250`.**
Code-verified review of five product promises (schemas as data, visible
personalization rules, no-data-loss invariants, `.mori` as backup,
ledger portability) plus one doctrine tension found in the auto-import
default. Every claim cites a file. Written by the planning session;
fix slices are sized for implementing sessions.

Companion: [`workflow-first-direction.md`](workflow-first-direction.md)
(priorities), [`search-and-session-unification-audit.md`](search-and-session-unification-audit.md)
(S1-S4), [`../mori-project-goal.md`](../mori-project-goal.md) §6
(invariants referenced below).

## TL;DR

The kernel engine is genuinely well built, and its read paths are
schema-driven as promised. But three of Mori's headline promises have
no product surface yet (schema authoring, rule visibility, kernel
backup), one invariant has a real hole in browser mode (quota-blind
kernel writes), and the auto-import default quietly diverges from the
written B-surface rail. None of this is architectural damage; all of
it is finishable in small slices. Priority: **Q1 (quota hardening) is
a correctness fix and should not wait**; the rest are scheduled gaps.

## 1. Findings

### F1 · Browser kernel writes bypass quota protection (High, correctness)

`localStorageAdapter.write` catches quota errors, notifies, and throws
a typed `StorageQuotaError` ("a failed save must never look like a
successful one", `src/lib/storage/localStorageAdapter.ts:654-665`).
The kernel browser store does not use it: `KernelBrowserStore.write`
calls `storage.setItem` with no try/catch
(`src/lib/record-kernel/kernelStore.ts:154-161`). On quota exceed, a
capture's record/revision write sequence
(`kernelRepository.saveRecord`, `kernelRepository.ts:107-122`) throws
raw mid-sequence: a record can persist **without its revision**,
violating the visible-and-reversible invariant, with no health
notification. Browser localStorage (~5-10 MB) is reachable in normal
use, and auto-import registration is already writing drafts into the
same storage.

### F2 · Schemas-as-data has no authoring surface (High, extensibility)

The engine is complete end-to-end: user-scope validation and
registration (`schemaRegistry.ts:76-103`), persistence through both
stores (`kernelStore.ts:146-152`, `kernelRepository.ts:251-269`), and
the read path is genuinely generic (composer picker iterates
`registry.list()`, `RecordComposer.tsx:263-271`; `SchemaQuickForm`
renders any `SchemaDefinition` with zero per-schema code). But
`saveUserSchema` has **no product caller**: no settings screen,
composer action, or modal constructs a schema. A user cannot create a
`수면` or `독서` schema today; the differentiator is engine-only.

### F3 · Personalization rules are invisible and mostly unproduced (High)

- No "Mori가 배운 것" surface exists; nothing lists, disables, or
  deletes a `KernelRule` (search of `src/features/settings` confirms).
- Of seven rule kinds, only `alias` is produced at runtime
  (`renameEntity` → `buildAliasRule`, `useRecordLedger.ts:375-386`).
- The `date-inference` path is **unwired dead code**: `DateRuleOffer`,
  the `dateRuleMemory` correction counter, and
  `createDateInferenceRule` have no callers or JSX mount anywhere.
  This is a regression against the record-workspace worklog's R4
  "done" claim, likely dropped in the R7a document-workspace pivot.
- `classification` / `context-binding` / `automation-level` are
  consumed by the pipeline if present (`personalization.ts:68-117`)
  but never created outside tests; `summary-preference` /
  `extraction-template` have neither producer nor consumer.

The doctrine (rules visible, editable, cited by automated
applications) is currently unmet on every count but storage.

### F4 · The kernel ledger has no backup or portability story (High)

- `.mori` v0 carries **zero kernel data**: its slices are the legacy
  session shapes plus accepted memories
  (`src/lib/mori-package/types.ts:54-92`,
  `fileLayout.ts:25-41`). The canonical store cannot be exported,
  moved, or backed up through the product's own package format.
- SQLite snapshots (`VACUUM INTO`, pruned to 5,
  `src-tauri/src/db/backup.rs:23-65`) do include kernel tables, but
  they are written **only when a migration is pending**, live on the
  same disk beside the DB, and the only restore UI renders in the
  migration-error state (`DatabaseRecoveryCard.tsx:31,44`). No
  user-initiated backup exists.
- **No browser→desktop migration**: `KernelRepository` picks a
  runtime at construction and never seeds SQLite from localStorage
  (`kernelRepository.ts:79,117-133`; fallback exists only in the other
  direction). A browser user who installs the desktop app starts with
  an empty ledger and orphaned browser data.

K4 (`.mori` v1) is the designed home for portability, but the interim
exposure is real: the store users are told is canonical is the one
store the product cannot yet back up on demand.

### F5 · Eager full-table load, unbounded revisions (Med, scale)

`useRecordLedger.reload` loads every record/object collection with no
limit (`useRecordLedger.ts:184-202`); both stores list full tables
(`kernelRepository.ts:124-134`, `kernelStore.ts:175-184`). Revisions
are append-only with no compaction, retention, or size telemetry.
Fine at thousands of records; degrades in the low tens of thousands,
and in browser mode collides with F1's quota ceiling much earlier.
Not urgent, but the pattern should be named before auto-import and
content-learning multiply record counts.

### F6 · Auto-import default-on vs the written opt-in rail (doctrine)

Continuous auto-import registers discovered agent sessions by default
(`autoImportSettings.ts`: "on by default", opt-out in 연동). The
B-surface rail 3 as written says "**explicit opt-in**, an
always-visible watching/off state" (`mori-project-goal.md:714`), while
§6's policy bullet says approved-scope sources "may sync automatically
within the approved scope, under the three rails". The module's own
doctrine note argues registration-only sync is not the gated act. The
implementation is defensible, but it currently **contradicts the rail
text rather than updating it**. Per §6 ("a policy may change...
deliberately and in writing"), the goal doc should either carve
registration-only sync out of rail 3 explicitly, or the default should
flip to off. This is a user decision; the review only flags that
doctrine and code disagree in writing today.

## 2. Severity table

| Promise | Reality | Severity |
| --- | --- | --- |
| Failed save never looks like success | Browser kernel writes quota-blind; record-without-revision possible | **High (correctness)** |
| User-defined schemas as data | Engine + read path complete; no authoring UI | High |
| Rules visible / editable / cited | No surface; 1 of 7 kinds produced; date-inference dead code (regression vs worklog) | High |
| `.mori` as backup | No kernel slices; snapshots auto-only, same-disk, error-state UI | High |
| Browser→desktop continuity | No kernel migration path | High |
| Revision growth managed | Append-only, no telemetry; eager full loads | Med |
| B-surface rails hold | Auto-import default-on vs rail 3 wording | Doctrine (decide in writing) |

## 3. Recommended slices

- **Q1 · Kernel quota hardening (now, small).** Route
  `KernelBrowserStore` writes through the quota-aware path (or
  replicate catch → notify → typed error), and make
  `saveRecord`'s record+revision sequence fail atomically from the
  caller's view (write revision first, or roll back the record on
  revision failure). Task chip spawned.
- **Q2 · User-initiated backup (pre-K4 interim, small).** A "지금
  백업 만들기" action in 설정 > 저장 reusing the existing `VACUUM
  INTO` path with a user-chosen destination (Save As), plus a
  last-backup timestamp. Buys real data safety without waiting for
  `.mori` v1; explicitly labeled as whole-DB, desktop-only.
- **Q3 · Browser→desktop kernel import (small-medium).** On first
  desktop run (empty kernel), offer to import browser-store kernel
  data if present, reusing the object collections' shapes verbatim.
  Alternatively fold into K4's `.mori` v1 import if K4 is near.
- **Q4 · "Mori가 배운 것" rules card (medium).** A settings card
  listing rules (kind, condition, effect, learnedFrom, enabled
  toggle, delete), reading the existing `rules` state. Re-wire the
  date-inference offer (`DateRuleOffer`) or explicitly retire it in
  the worklog so the R4 claim stops being false.
- **Q5 · Schema authoring MVP (medium).** 설정 > 스키마: create a
  user schema from name + layer + property rows (the types
  `SchemaQuickForm` already renders). No editing of system schemas;
  delete only while unused. This turns the differentiator on.
- **Q6 · Storage telemetry line (small).** 설정 > 저장 shows record /
  revision / object counts and browser-mode storage pressure, so F5
  becomes observable before it hurts.
- **Q7 · Doctrine decision (user, writing only).** Resolve F6 in
  `mori-project-goal.md`: amend rail 3 to name registration-only sync
  as allowed-by-default under scope+transparency, or flip the
  default. One paragraph either way.

Priority relative to standing work: Q1 immediately (correctness);
Q2 next (cheap durability); Q4/Q5 are the extensibility payoff and
slot naturally after the Reuse slices S1-S3; Q3 before any push to
move real users to desktop; Q6 anytime; Q7 whenever the user decides.
