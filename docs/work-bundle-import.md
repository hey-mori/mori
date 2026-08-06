# Work Bundle Import · composite multi-source work units

This document records the Work Bundle capability and the product-value
assessment behind it. It is a companion to
[`mori-project-goal.md`](mori-project-goal.md) and
[`imports.md`](imports.md).

## What it is

A single AI coding work session rarely leaves one artifact. The same hour of
work produces a Claude / Codex / OpenCode transcript, a Codex run log, a git
diff, a few terminal commands, and a note-to-self. Mori already normalizes
each of those individually. The **Work Bundle** layer treats several of those
normalized candidates as *one work unit*, shows a reconstructed preview before
anything is applied, and applies them together while keeping each source
distinct.

- `src/lib/import/workBundle.ts` · `buildWorkBundlePreview(items)` is a pure
  derivation (no I/O, no LLM, no network) that answers the product-validation
  questions directly from the already-normalized evidence: detected source
  families, a work-context hint (the shared work area inferred from the files
  the sources touch), a proposed work-unit title, event / source / file
  counts, cross-source duplicate counts, a trust + capture-fidelity summary,
  redaction / secret flags, the time span, and a "what will be created"
  summary.
- `src/lib/import/fixtures/workBundleFixture.ts` · a synthetic but realistic
  bundle for a fictional `acme-notes-app` offline-sync session (Claude design
  transcript + Codex run JSONL + git diff + terminal log JSONL + hand-off
  note). No secrets, no real paths, no tokens.
- `addImportBatch` on the session store · applies the bundle by persisting
  **each source as its own session import** (its own `SourceRef` + events), so
  per-source provenance survives into the Evidence Hub and Timeline. The
  bundle is not flattened into one merged source.
- `WorkBundlePanel` (in the Connections source hub) · load the sample bundle
  or paste sources (AI transcript / Connector JSONL / git diff / note / URL),
  stage them, review the composite preview, and apply to the Timeline.

## Review-before-apply

The composite preview is the explicit review gate for the bundle: nothing is
persisted until the user clicks Apply, the preview shows exactly what will be
created, and the user can remove any source first. Apply requires an active
session; in demo mode the preview still renders read-only and Apply is
disabled with an honest reason. After apply, per-event correction stays
available in the Timeline / Review surfaces, and nothing becomes durable
project memory without passing through Consolidation Review · so no
memory-protecting gate is bypassed.

## Product-value assessment

Validated against the bundled fixture end-to-end (load → preview → apply →
Timeline / Evidence):

- **Does the source data become a useful timeline?** Yes. Five heterogeneous
  sources reconstruct into one 17-event timeline across seven activity lanes
  (conversation / command / files / git / docs / build / notes), with a gap
  marker between the design conversation and the implementation run, and
  same-window event bundling. It reads as reconstructed work, not a raw log.
- **What was valuable?** The composite preview answers "what happened",
  "which source produced which event" (five distinct Evidence sources
  survive), "what files / commands appeared", and "what will be created"
  before any write. The work-context hint (`src/sync`) and proposed title
  (taken from the first AI turn's goal) make the unit legible at a glance.
- **What was noisy?** Best-effort file detection from event titles / summaries
  is approximate · it dedupes bare filenames against fuller paths, but it can
  still miss a path that only appears in a connector `command` field rather
  than the rendered summary. It is honest ("detected files"), not an
  authoritative file list.
- **What was hard to parse?** Plain-text transcripts collapse to a single
  conversation event (the existing transcript normalizer is summary-level);
  the richest structure comes from connector JSONL, which carries per-event
  kinds, files, and commands.
- **What UI helped comprehension?** The four stat cells (sources / events /
  files / duplicates), the family chips, and the per-source rows with trust +
  fidelity + retention made the bundle understandable without opening each
  source.
- **What needs better source metadata?** A first-class shared project / repo
  identifier on every source (today the hint is inferred from file paths)
  would make the work-context hint exact rather than heuristic.

## What remains weak / next pass

- The preview does not yet show **review candidates** (issues / decisions /
  next actions); those are produced by Quick Pass after apply. A future pass
  could surface lightweight candidate hints in the preview.
- File detection could read structured file lists from connector git metadata
  rather than re-extracting from rendered text.
- A heterogeneous **Import Review** that vets per-event accept / discard for a
  whole bundle in one surface (today multi-event vetting happens per single
  source, or per event after apply) is a natural follow-up.

## Best next source integration

Structured connector run logs (Codex / OpenCode) are the highest-signal
source · they already carry per-event kinds, files, commands, and timing.
Strengthening the connector → timeline mapping (explicit file artifacts, test
pass/fail events) would most improve the reconstructed-work quality for the
bundle.
