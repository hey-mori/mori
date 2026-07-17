# 기록 v7 · document understanding

Status: **plan, 2026-07-17. Supersedes v5 §3 and v6 §3's extraction framing.
Needs one user decision (§8). Nothing here is a stopgap.**

## 0. The mistake this document corrects

Mori asks one question of every note: **"what did the writer do?"**

That is a meeting-transcript question. Competitive research across 13 AI note
tools (Mem, Reflect, Notion AI, Granola, NotebookLM, Tana, Capacities,
Heptabase, Craft, Obsidian Copilot / Smart Connections, Napkin, Saner.ai, Amie)
found:

> **Not one emits "a list of things the writer did" from a prose document.**

The four that extract action items (Granola, Amie, Saner, Mem) do it **only from
meeting transcripts**, where a speaker-diarization channel says who committed to
what, and they attribute an owner. Granola's docs: tasks "with associated owners
and deadlines when mentioned."

That channel is exactly what v6 §2 said the regex lacks. **Mori took a
transcript primitive and pointed it at a reading document.** The Kotlin article
that produced four 활동 records off `개발자` and `작성하기 쉽고` was not a bug in
the word list. It was the wrong question, asked of the wrong document.

The user's framing is the correct one and this plan adopts it wholesale:

> "오히려 요약을 해야 맞지 ... 요약하고 거기서의 용어를 찾아서 설명하고 문맥을
> 파악하고 글의 성격을 이해하고 ... 그 안에서 인사이트를 얻고 ... 사용자가 뭘
> 했는지 같은 것들은 또 그런 문서의 성격에 맞게 이해할 수 있어야."

**The inversion: understanding is the product; "what you did" is one output of
it, emitted only when the document is the kind that has one.**

## 1. What Mori emits per document

Ranked by how universal each primitive is across the 13 tools:

| Primitive | Who emits it | Mori |
| --- | --- | --- |
| **Summary** | everyone | **Always** (§2) |
| **Related notes** | near-universal, embeddings only | Already have `[[links]]` + backlinks |
| **Key terms / glossary** | **NotebookLM alone** | **Always. This is the differentiator** (§3) |
| **Insights with source anchors** | **Heptabase alone** | Yes, gated by length (§4) |
| **Action items** | transcript-only | **Only when the document is a log** (§5) |
| Questions | NotebookLM | Not now |

Two of the six primitives Mori should own are held by **exactly one competitor
each**. Automatic, always-present, **Korean-first** term explanation is unowned
in this market. That is where a Korean product beats Anglophone incumbents
outright, and it is precisely what the user asked for.

## 2. 요약 · always present

**Always, for every document over a length floor.** Not opt-in, not a property
the user configures. Nobody in the market ships this by default: Notion's AI
Summary is opt-in per property per database; NotebookLM's source guide is the
closest (auto on add, no configuration). Shipping it by default is a deliberate
lead, not an oversight.

**Gate by LENGTH, never by nature.** Length is observable; nature is guessed.
This is Heptabase's rule (AI Insight is offered when a card "is lengthy") and it
avoids v6 §3's asymmetry entirely: a length gate cannot hide a true record.

**Honest cost, recorded rather than hidden:** the strongest critique of always-on
summarization is that it "reconstructs thought using patterns from formal
documents," treating "hesitation markers, self-corrections, and embedded
questions as noise," stripping stance and uncertainty. For a **journal** that is
a lie of a different kind than the regex tells. The length floor is what protects
against it: a three-line journal gets no summary because it does not need one.

**The nature line lives here as prose, not a chip:** `Kotlin 학습 자료 · 4,000자`.
Correctable on click. Never a `<select>`.

## 3. 용어 · the differentiator

For each unfamiliar term in the document: the term and a gloss **grounded in this
document's own context**. Not a dictionary lookup: `문법` in a Kotlin article
means syntax, and that is the entire lesson of the failure that started this.

Selection rule, stated honestly: **Mori does not know what is important. It knows
what is jargon-shaped and undefined in the document.** This is why the region is
called 용어 and not 주요 용어: "주요" is a ranking claim the machine has to earn,
and if it lists four terms and one is trivial, "주요" is the lie.

A confirmed term+gloss mints as the existing `knowledge` / 지식 schema. **Zero
kernel work.**

## 4. 인사이트 · with provenance by construction

Adopt **Heptabase's mechanic exactly**: chunk the document into ~300-character
units, emit at most one insight per chunk, and **every insight carries a pointer
back to its source span**.

This is the mechanical answer to v6's through-line, "a note tool earns trust by
never lying": **you cannot hallucinate a record if every output must name the
span it came from.** The same instinct appears twice more in the research:
Granola renders your notes in black and AI additions in gray; Heptabase's
citations point at specific blocks.

**Condition, stated plainly: this region ships EMPTY until §8 is answered.** An
empty 인사이트 is honest. A populated one from keyword matching is the exact lie
v6 was written to remove. If empty-at-launch is unacceptable, the region is named
**짚어둘 것**, which a weaker engine can honestly fill.

## 5. 남길 기록 · nature-appropriate, and routinely empty

"What you did" is demoted from *the surface* to *one region, last*.

- Emitted **only** when the document's nature is a log (일지 · 회의록).
- For the Kotlin article it shows **nothing**, and nothing is the true answer.
- Named 남길 기록 because nothing is a record until you keep it, and because **it
  degrades correctly**: the honest output for most documents is an empty region.

`확인할 것` is rejected: it is already the rail's group name, and two of them on
one screen is a bug. `기록 후보` is rejected: it leaks kernel vocabulary to the
surface, which architecture §16.1 forbids.

## 6. Nature · inferred, never asked

The chips are deleted as a control. The user's verdict is confirmed by the
market: **Granola suggests templates but still requires one click, and reviewers
complain about exactly that** ("the same standup every Monday at 10" should
auto-apply). The market leader's one required click is already too much.

**The reference implementation is NotebookLM Reports:** it "dynamically suggests
options based on the theme, topic or industry mentioned in your sources" (an
economics article → a glossary; a short story → character analysis). The model
classifies. **The user never sees a type picker. The classification's only
expression is which outputs get offered**, so a wrong guess costs a glance at an
irrelevant option, never a hidden truth. That is v6 §3's required asymmetry,
achieved with no chip.

**Mechanism: embedding + nearest-centroid. Always on, no LLM, ~150ms.**

- Rust-side (`fastembed-rs`), `multilingual-e5-small-ko-v2` int8 (~120MB), over
  title + first 512 tokens. Six centroids, cosine, score = **margin** between
  nearest and second-nearest.
- Cold start: seed each centroid from 3-5 Korean exemplars (zero-shot by label
  embedding).
- **Correction = `centroid[target] = EMA(centroid[target], embedding(note))`.**
  O(1), instant, no training step. ~8 examples per class is the working point, so
  ~48 corrections total. **The correction IS the training signal**: Gmail's
  category mechanic, which is the closest analogue to note-nature (ML-classified,
  mutually exclusive, per-user, learns from your actions).
- Keep the two **structural** heuristics, which are free and actually correct:
  URL-dominance → 스크랩, ≥2 attendee-shaped lines → 회의록.
- **Delete every topical keyword** (`STUDY_RE`, `RETRO_RE`). Those produced the
  Kotlin failure.

**Low confidence UI:**

| Margin | Chip | What folds |
| --- | --- | --- |
| High | `학습 노트` | nothing |
| Low | `학습 노트?` dimmed | nothing |
| Below floor | no chip | nothing |

**Never a percentage. Never a modal. Never a prompt to choose. Nothing folds,
ever** (v6 §3 stands).

**The seam that must change first:** `NoteEditorPane.tsx` computes
`natureOverride ?? detectNoteNature(body)` in a `useMemo` keyed on `body`, i.e.
**synchronously on every keystroke**. No engine can live in that shape. Nature
becomes async, debounced, and cached on the record before anything else here.

## 7. Organization · one placement, many memberships

The user is right that structure is absent, and the fix is nearly free.

**`KernelContext.parentId` already exists (`kernelTypes.ts:128`) and is 100% dead
code**: a grep across `src/` and `src-tauri/` returns exactly one hit: the
declaration. Contexts round-trip through `payload_json`, so **nesting costs zero
migration, zero SQL, zero Rust change.** It is the cheapest structural change
available in this codebase.

And single-placement is already enforced: `withProject` strips every project
context then appends at most one. **Folder-compatible by accident.**

**Hierarchy = `parentId`. Not a path string, not tags.**

- **Not a path string** (`"회사/mori"`): Logseq migrated *away* from
  name-embedded namespaces precisely because renaming a segment rewrites
  everything beneath it. Adopting a path now is adopting the bug Logseq removed.
- **Not tags:** the kernel has **no tag concept at all** (zero hits). A tag would
  be a third organizing axis beside schemas (what kind) and contexts (what it is
  about), strictly weaker (no id, no type, no parent, no archive), and the *most*
  manual axis, the opposite of the user's demand. §16.3 also forbids a new
  concept the user must learn first.
- **Not `part-of` relations:** v6 §4 already made this call for `contextIds` over
  `belongs-to`: relations have no update or delete. Re-parenting is the same
  shape of problem. `parentId` is a plain field, so a re-parent is one write
  instead of a delete the relation store cannot do.

  > **Correction, 2026-07-17 (found while building §7).** This bullet originally
  > read "`parentId` is patchable, so a re-parent is an audited revision the
  > existing 되돌리기 undoes." **That was false.** `KernelRevision` is keyed by
  > `recordId` (`kernelTypes.ts:226`) and `saveContext` is a whole-object
  > overwrite with no before/after: **contexts have no revision log at all**, so
  > nothing about a rename or re-parent is audited or undoable by 되돌리기.
  > The conclusion (`parentId` over relations) still stands on its own merits ·
  > a rename touches one name and never rewrites descendants, which is the Logseq
  > lesson · but it does NOT stand on an undo guarantee that does not exist.
  > Consequence: rename / re-parent must ship with their own 되돌리기 offer, and
  > "contexts are unversioned" is a real limit to state plainly, not to paper over.

**Vault mapping: the path is DERIVED, never stored.**

```
Projects/회사/mori/…          ← the parent chain nests inside the committed bucket
Journal/2026/2026-07-14.md    ← bucket derives from schema, not user choice
Knowledge/…
```

A rename becomes a *move*; the id never changes. This **refines** §10.4 rather
than contradicting it: its `Projects/<name>/…` already has a `/…` tail, and the
top-level buckets stay exactly as committed.

Front-matter honors §10.4's already-committed **plural** `contexts`:
`contexts: [회사/mori, SQLite]` (readable, Bases-queryable) plus
`mori_context_ids: [ctx-…]` (lossless re-import; ids are the truth).

**The central tension, stated plainly: a filesystem gives each file exactly ONE
path, but `contexts` is plural.** Resolution: the record's **one placement**
(its project) derives the path; every other membership lives in front-matter and
in the kernel. Obsidian itself converged here: Bases kept the path *and* made it
a queryable property (`file.folder`, `file.inFolder()`).

**Known breakage to fix with hierarchy (all real, all found in code):**

1. `projectGroups.ts`'s `projectKey()` collapses by **leaf name**, so `회사/mori`
   and `개인/mori` merge into one group. **This is already a latent bug today**:
   any two projects named `api` collapse. Sessions must bind by **id**, not name.
2. `groupRecordsByContext` skips a context with no direct records, so a parent
   holding only children vanishes. Needs descendant roll-up.
3. "First context wins" is array-order dependent and becomes ambiguous when
   parent and child are both filed.
4. No cycle guard, no rename, no re-parent: `createProjectContext` is the only
   context mutation that exists.
5. The picker and 프로젝트 list are flat, no indent.

## 8. The one decision · pointing the engine we already own at the note

**This plan does not ask for a new capability. It asks to use one Mori already
has.**

The local-LLM plumbing **already exists**: `ollamaProvider.ts`,
`openAiCompatibleProvider.ts`, `engineProfiles.ts`, `enginePresets.ts`,
`quickPassCapability.ts`, `analysisSettings.ts` (default
`http://localhost:11434`), and a settings surface (`LocalAiCard.tsx`) with
connection probing. The learning plumbing exists too: `personalization.ts` with
`KernelRule` kinds `alias` / `classification` / `context-binding` /
`automation-level`, each carrying `learnedFromRevisionIds`, and architecture §7
already specifies the correction-to-rule loop and the "Mori가 배운 것" surface.

**Mori does not need to build a local-LLM engine. It needs to point the existing
one at the note.**

- **요약 · 용어 · 인사이트 are impossible without it.** No amount of regex
  produces a gloss for `문법` that knows this document is about Kotlin.
- **Nature does NOT need it** (§6 is embeddings, ~150ms, always on).
- **Two engines, two clocks:** nature on every note, always, fast; summary/terms
  on idle or on demand, 10-20s, `format`-constrained JSON.
- **Model:** suggest **Mi:dm 2.0 Mini 2.3B (MIT)**: Ko-MTBench 74.0 vs
  Qwen3-4B's 63.0, i.e. Korean *generation over supplied context*, exactly this
  job. **Do not bundle it**; Mori suggests, the user pulls. **Do not default to
  EXAONE**: its Korean is excellent but 1.2-NC is non-commercial and Mori's
  commercial posture is undecided, defaulting silently prices in a rewrite.
  Surface the license on the model row.

**The decision: does 기록 depend on a local model for 요약 · 용어 · 인사이트?**

- **Yes** → build §2-§5 on the existing seam; delete the rule proposer's topical
  vocabulary; 인사이트 ships when the engine does.
- **No** → then 요약 · 용어 · 인사이트 cannot exist, and the honest consequence is
  that the panel stops claiming to find anything. Ship §6 (nature by embedding)
  and §7 (organization) alone, and rename the surface to match what it can
  actually do.

## 9. Layout · delete the right panel, put 읽기 above the document

The always-present summary and v2's approved "no right panel" are reconcilable,
because **vertical is the cheap axis and horizontal is the product.**

`.note-pane-doc` already scrolls. Per v5 §1 the measure *is* the product.

| Window | Measure today | After |
| --- | --- | --- |
| 1280 | 1280−64−248−**264**−80 = **624px** (designed: 720) | 1280−64−248−80 = 888 available → **720px reached for the first time** |

Kill `.note-extract` (264px). 읽기 becomes a collapsible header **above** the
note, inside the document column.

**Region order is load-bearing: 요약 → 용어 → 인사이트 → 남길 기록**, records
LAST and routinely empty. Today's panel makes records the entire surface.
**Reorder first; the names are downstream.**

## 10. Naming

The surface is **읽기**. The user 쓰고, Mori 읽는다. Honest at the right
epistemic level: reading is fallible and everyone knows it, whereas a tool that
says 이해 and then mislabels a Kotlin article lies twice.

**No visible title on the surface**: the regions title themselves (요약 · 용어 ·
인사이트 · 남길 기록). This is Notion's model: it does not label the property
block "Notion AI가 찾은 것"; the properties just *are* Summary and Key info. It
also satisfies the copy-diet rule. 읽기 lives in docs, settings and the
aria-label.

Rejected: **분석** (technical, overclaims), **AI 요약** (brands the vendor, not
the job), **Mori가 찾은 것** (informal; "찾은" is the claim the Kotlin article
disproved: it did not find, it cut).

## 11. Non-goals

- Do not tune the rule proposer (v6 §8 stands): effort there buys rate, not
  correctness.
- No tags. No path strings as identity. No type picker.
- Do not bundle a model.
- Do not ship 인사이트 populated by keywords.
