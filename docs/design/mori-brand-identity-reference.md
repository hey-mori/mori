# Mori Brand Identity Reference

Design reference note for Mori's visual identity. This file interprets an
external logo/brand concept board and translates it into durable guidance for
the actual product · tokens, assets, shell, and screen polish. It is a
*reference*, not a spec for pixel-copying the concept image.

Reference image:
[mori-logo-brand-concept-reference.png](../assets/screenshots/mori-logo-brand-concept-reference.png)

---

## 1. What the reference image is

The board is an external "MORI – LOGO CONCEPT 03" exploration. It shows:

- a primary logo (rounded app icon + `mori` wordmark),
- logo variations (full lockup, icon only, monochrome, light-on-dark),
- a purple/lavender color palette,
- two usage mockups (a sign-in screen and a macOS-style app icon).

Tagline on the board: *"Your work, remembered. Guided by AI, local to you."*
Concept pillars: **Guidance**, **Companion**, **Trust**.

It is a *direction*, not a production asset. The PNG itself is not shipped in
the app · production assets are rebuilt as clean SVG/CSS (see section 4).

## 2. What is useful and should be adopted

- **Purple/lavender identity.** Purple is the brand accent. Lavender is the
  soft brand surface tint. This matches Mori's existing `--purple` token
  family and is kept.
- **Calm, local-first, supportive tone.** Professional, quiet, never hype.
- **The pillars map directly onto product behaviour:**
  - *Guidance* → the Companion surface and inline next-action hints.
  - *Companion* → Mori works alongside the user, in the background, never
    noisy.
  - *Trust* → local-first storage, explicit capture, review-before-apply,
    evidence-linked memory.
- **A single, recognisable mark.** A focus/guiding-light idea works as a
  scannable icon at favicon size.

## 3. What should be adapted (not copied literally)

- **The mark.** The concept's guiding-light shape is rebuilt as clean vector
  production art: a soft four-point star over an upward focus beam. It should
  read as guidance and continuity, not as loose decorative sparkle.
- **Gradient usage.** The board leans on glossy gradients. In-product,
  gradient is used sparingly: the app icon and the sidebar brand mark only.
  Flat brand color is used everywhere else.
- **The wordmark.** Lowercase `mori` is kept, but set in the product UI font
  (Inter) rather than a bespoke display face, so the header/sidebar lockup
  stays consistent with the rest of the interface.
- **The sign-in mockup** is a styling reference for the auth shell only · not
  a mandate to add Google sign-in. Mori is local-first; the local-profile
  flow stays primary.

## 4. What must NOT be copied blindly

- Do **not** paste the concept PNG anywhere in the running app.
- Do **not** add extra decorative sparkles, glows, or twinkle motion around
  the brand mark.
- Do **not** turn the whole UI purple. Purple is brand accent only.
- Do **not** let purple bleed into status semantics · verified/observed/
  inferred, issue/decision/next-action, and local/cloud/planned states each
  keep their own distinct hue (see section 6).
- Do **not** make the app icon look like a toy, a chatbot bubble, or a
  generic SaaS gradient blob.
- Do **not** introduce cloud-forward branding · Mori is local-first and the
  identity should never imply an always-online service.

## 5. How it influences Mori's UI

| Surface | Brand application |
|---|---|
| App icon / favicon | Rounded purple-gradient tile with the abstract focus mark. |
| Sidebar brand | Flat brand mark + `mori` wordmark; one gradient instance. |
| Active nav state | Lavender (`--mori-accent-soft`) fill, purple text/icon. |
| Primary CTA | Solid brand purple; one primary action per screen. |
| Companion / Mori Notes | Lavender-tinted surface, brand mark as the speaker. |
| Empty states | Lavender icon chip, calm copy, never a hard sell. |
| Auth / local-profile shell | Brand lockup at top, calm surface, local-first copy. |

Everything else (cards, tables, timelines, inspectors) stays neutral
slate/ink so the product reads as a serious work tool.

## 6. Brand vs. semantics · the colour contract

Purple is **brand**. It must not be the colour of every state. Mori needs
clear, learnable separation:

- **Brand accent** · purple (`--mori-accent`). Identity, primary CTA, active
  nav, companion.
- **Trust levels** · verified = green, observed = blue, inferred = purple.
  (Inferred deliberately shares the brand hue: an inference is Mori's own
  reasoning.)
- **Work items** · issue = red/amber, decision = blue, next action = green.
- **Capability/runtime** · local = green, cloud = blue, planned = neutral
  slate, unavailable = muted/dashed.
- **Feedback** · success = green, warning = amber, risk/danger = red.

If a new state needs a colour, reuse a semantic token · never reach for
purple just because it is the brand.

## 7. Identity guardrails (carry into every change)

Mori **is**: a local-first AI work-memory companion; explicit capture only;
review-before-apply; evidence-based; calm and professional; close to the
user's real work; helpful without being noisy.

Mori **is not**: a generic SaaS dashboard; a chatbot UI; a toy AI assistant;
a surveillance app; a decorative productivity app; a fake-connected
prototype.

Copy tone: calm, professional, honest about what Mori knows. Korean product
copy stays in the established voice · e.g. "작업 흐름을 기억합니다",
"검토가 필요한 결정", "근거가 약한 항목", "로컬에 저장됨".
