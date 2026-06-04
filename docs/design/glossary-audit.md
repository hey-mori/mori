# Glossary — implementation audit

Status: **Slice 1 (extraction) + Slice 2 (LLM definitions) + Slice 3 (UI)
implemented.** The glossary ships as a card on the Project Memory page.

## 1. What the Glossary is

The technical terms that recur in a session's reviewed work, each linked
to the evidence that mentions it, optionally explained by the user's Local
LLM. It answers "what are the terms / acronyms / concepts in this work, and
what does each mean?" against reviewed evidence, helping someone reading
back (or new to the project) understand the vocabulary.

It is **not** a capture surface and not a generic dictionary. It reads only
reviewed curated fields (event / source titles and summaries), and every
term carries the reviewed items that mention it. Output is a proposal,
never durable memory.

## 2. Why this is a good next capability

- **The user named it.** They asked for the work's terms to be surfaced and
  for the Local LLM to "보완 설명" them so the current work is easier to
  follow. It differentiates Mori from a passive note store.
- **Reuses shipped infra.** Slice 2 definitions ride the Ask Mori LLM port
  (`src/lib/ask-mori/askMoriLlm.ts`), so no new engine or settings.
- **De-risked, pure-lib first.** Slice 1 is a deterministic, tested pure
  helper with no UI gamble, mirroring how Ask Mori shipped.
- **Principle-clean.** Reviewed evidence only, LLM optional, proposal not
  durable memory, no new capture, no A-surface.

## 3. Slices

### Slice 1 — deterministic extraction (implemented)

`src/lib/glossary/`:

- `glossaryTypes.ts` — `GlossaryTerm` (term, kind, occurrences,
  evidenceRefs, salience), `GlossaryEvidenceRef`, `GlossaryResult`.
- `extractGlossaryTerms.ts` — pure scan of timeline events + evidence
  sources for three term shapes: **code** (camelCase / snake_case / dotted
  / path), **acronym** (all-caps initialisms, with a small stoplist), and
  **phrase** (capitalized multi-word domain terms, with leading-stopword
  stripping). Counts every mention, dedupes evidence by item, ranks by
  salience (occurrences biased by kind), caps the result.
- `index.ts` + colocated tests (7 green).

### Slice 2 — grounded LLM definitions (implemented)

`glossaryDefinition.ts`: a pure `buildGlossaryDefinitionPrompt(term)` plus a
`defineGlossaryTerm(term, deps)` orchestrator that reuses the `AskMoriLlm`
port. Unlike Ask Mori, the definition prompt may use the model's general
knowledge for the term's standard meaning, then ties it to the work via the
occurrence titles. With no LLM (or on error) it degrades honestly to listing
where the term appears (`deterministicFallback`). Covered by colocated tests.

### Slice 3 — UI (implemented)

`src/features/memory/GlossaryCard.tsx`: a card in the Project Memory
"메모리 분석 · 도구" disclosure, sibling to the Ask Mori and Memory Search
cards, fed the active session's `view.events` / `view.sources` plus
`analysisSettings`. Lists terms with a kind badge, occurrence count, and
evidence titles; an on-demand "설명" action calls Slice 2 (`defineGlossaryTerm`)
with the settings-derived LLM, rendering the definition inline with an honest
"LLM 설명" / "등장 위치" basis badge. Korean-first, reuses the `memory-search`
classes. Chosen over a session-detail peek for the lower risk and identical
data wiring; promotion to session detail stays a later option.

## 4. Validation

- Slice 1: `npx vitest run src/lib/glossary` (7 green), project typecheck
  clean. Pure, no network, fixture-driven (per working rules; no pixel
  tests).

## 5. Open questions for Slice 2 / 3

1. Slice 3 placement: session-detail peek vs project-memory card.
2. Definition caching: recompute on demand vs persist a reviewed
   definition (persisting would route through the normal review gate).
3. Whether to fold the glossary into the Ask Mori card or keep it a
   distinct surface.
