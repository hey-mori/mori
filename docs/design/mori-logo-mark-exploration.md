# Mori Logo Mark Exploration

Comparison of three production mark directions for Mori, created to replace
the first "stacked ascending chevron" mark.

Concept files (each rendered as a full app-icon tile):
[A](../../public/mori-mark-concept-a.svg) ·
[B](../../public/mori-mark-concept-b.svg) ·
[C](../../public/mori-mark-concept-c.svg)

## Why the previous mark was rejected

The first mark was two stacked ascending chevrons. Problems:

- **No product meaning.** Chevrons read as generic "motion / upload / play",
  not memory, evidence, or continuity. It could belong to any app.
- **Generic silhouette.** A chevron pair is one of the most over-used shapes
  in software iconography — it gave Mori no ownable identity.
- **Weak, not calm.** Two thin strokes with a gap read as flimsy rather than
  the calm, serious, trustworthy tone Mori needs.
- It expressed none of Mori's actual ideas (remembered work, structured
  memory, evidence, review, continuity).

## The three concepts

Each concept was rasterised to a canvas at 64/32/16 px and measured for
coverage, bounding box, and horizontal symmetry. Notes below combine that
measurement with design judgement.

### Concept A — Monogram M

- **Visual idea:** A geometric capital **M** built from two confident
  strokes, with a rounded square "memory node" seated in the central valley.
- **Represents:** Mori's identity (the M) holding a unit of structured
  memory (the node) — *remembered work* + *structured memory*.
- **Strengths:** Boldest of the three (≈25% coverage, perfectly symmetric);
  the most robust at 16px; instant brand-letter recognition.
- **Weaknesses:** A lettermark leans corporate; an M-with-a-box risks
  reading as "M plus a generic shape" rather than one idea.
- **Small size:** Excellent — still 25% coverage and centred at 16px.
- **Monochrome:** Works cleanly (strokes + filled node in one colour).
- **Feels like Mori:** Partly. Safe and legible, but more "company initial"
  than "work memory".

### Concept B — Memory tag  *(chosen)*

- **Visual idea:** A notched bookmark / tag with a single counter hole — the
  shape you attach to a piece of work to mark and keep it.
- **Represents:** *Remembered work* (you tag and save it) + *continuity*
  (the downward point marks your place, where you resume) + the counter
  reads as the focal entry.
- **Strengths:** The most ownable, least generic silhouette — a notched tag
  is unmistakable and will not be confused with a generic gradient app icon.
  Calm, serious, and literally about saved work. Near-perfect symmetry.
- **Weaknesses:** A tag is a familiar "filing" metaphor; it must stay bold
  so it does not look like a toolbar bookmark glyph.
- **Small size:** Strong. Production B (widened, larger counter) keeps the
  notch **and** the open counter legible down to 16px (verified on canvas).
- **Monochrome:** Excellent — a single filled shape with one counter
  (`fill-rule="evenodd"`), so it reverses on any background.
- **Feels like Mori:** Yes. Recognition comes from the silhouette, not from
  fragile detail, and the metaphor is exactly Mori's promise — work,
  remembered.

### Concept C — Evidence keystone

- **Visual idea:** Two evidence sources (lower nodes) resolve up into one
  memory (the apex rounded square).
- **Represents:** *Evidence-backed context* + *review-before-apply* —
  sources consolidated into a single reviewed memory.
- **Strengths:** Conceptually the richest; expresses Mori's evidence model
  directly.
- **Weaknesses:** Busiest of the three; the thin diagonals read as a generic
  "network / share" glyph and lose cohesion at small sizes.
- **Small size:** Weakest — only ≈13% coverage at 16px, fragments into
  separate dots, and measured asymmetry crept in (0.94) from thin strokes.
- **Monochrome:** Works, but the busyness carries over.
- **Feels like Mori:** In meaning yes, in execution no — too fragile and too
  close to a connectivity icon.

## Decision

**Concept B — Memory tag — is the chosen direction.**

It is the most distinctive and most honest mark: a calm, serious silhouette
that says "work, remembered" without decoration, survives down to favicon
size on its silhouette alone, and reverses cleanly in monochrome. Concept A
is the runner-up (safe but corporate); Concept C is set aside (rich idea,
fragile execution).

Production B is lightly refined from the concept file: a slightly wider tag
and a larger counter so the hole stays open at 16px.

The brand gradient tile is unchanged — it remains the app-icon container;
only the white mark inside it changes.
