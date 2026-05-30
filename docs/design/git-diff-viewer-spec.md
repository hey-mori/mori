# Evidence · Inline Git Diff Viewer (spec)

A buildable spec for rendering Git evidence as a real, readable diff inside the
Evidence Hub instead of a text blob or a one-line summary. Git imports are the
most concrete evidence Mori holds, so making them inspectable in place is
dead-on the "evidence is the source of truth" principle, and it stays strictly
local. Design spec, not yet implemented.

Parent: [`product-improvement-plan.md`](product-improvement-plan.md) (§2, §3),
[`visual-system-direction.md`](visual-system-direction.md). Domain:
`SourceKind` includes `gitDiff` / `tauriGitDiff` / `git` / `gitCommand`;
`SourceRef` carries `rawRetention` and `detail`.

---

## 1. Why

A git source today surfaces as text or a brief summary. The user cannot see
*what changed* without leaving Mori. A calm inline diff (files, hunks, +/-
counts, added/removed line tones) turns retained git evidence into something the
user can actually verify against a decision or an issue, which is the whole
point of evidence.

---

## 2. The honesty gate (decides whether to render at all)

`SourceRef.rawRetention` governs this entirely:

- `retained` · the unified diff text is available; render the full diff viewer.
- `summaryOnly` · no raw diff kept; show the existing summary and a calm note
  ("원문 diff는 보관하지 않았습니다"), never a reconstructed/fake diff.
- `deleted` · same as summaryOnly, with the deletion stated honestly.

Mori never fabricates diff content it did not retain. The viewer is a *renderer*
of retained text, not a git client.

---

## 3. Pure parser

```ts
type DiffLine = { kind: "add" | "del" | "context" | "meta"; text: string;
  oldNo: number | null; newNo: number | null };
type DiffHunk = { header: string; lines: DiffLine[] };
type DiffFile = { path: string; oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[]; added: number; removed: number };
type ParsedDiff = { files: DiffFile[]; added: number; removed: number;
  truncated: boolean };

function parseUnifiedDiff(text: string, opts?: { maxLines?: number }): ParsedDiff
```

- Parses standard unified diff (`diff --git`, `---`/`+++`, `@@` hunks, `+`/`-`/
  space lines). Pure, deterministic, no deps.
- Tracks old/new line numbers per line for the gutter.
- `maxLines` caps very large diffs; `truncated` is surfaced honestly (no silent
  cut). Per-file collapse keeps a big changeset legible.
- Robust to partial/odd input: unparseable content degrades to a single
  `meta`/context block rather than throwing (a fragment is still shown as text).

---

## 4. View

Inside the Evidence Hub source detail (the existing right panel / expanded row):

- **File list header:** one row per `DiffFile` (path, status glyph, `+added`
  `-removed` counts), collapsible. Lead with the summary; expand a file to see
  hunks.
- **Hunk rendering:** two-gutter (old/new line numbers) + the line, with
  add/del/context tones. Monospace for the code column only.
- **Counts strip:** total `+added` / `-removed` and file count at the top, the
  at-a-glance verdict before any expansion.
- **Truncation note:** if `truncated`, a calm "일부만 표시됨" line with the
  retained extent.

---

## 5. Visual treatment

- **Add / remove tones:** green / red **backgrounds at the `-50` tint level**
  (`--green-50` / `--red-50`) with the sign in the gutter, not saturated fills.
  This is the one place red/green line-tinting is semantically correct (diff
  convention); keep it soft per the calm surface.
- No left-accent bars; the gutter sign + soft tint carries the line kind.
- Collapsed-by-default files; density consistent with the Evidence rows.
- Monospace confined to the code column; everything else stays the UI font.

---

## 6. Honesty and edge cases

- `summaryOnly` / `deleted`: no viewer, honest note (see §2).
- Binary files / rename-only: show the status row, no body.
- Huge diff: cap with `maxLines`, surface `truncated`, offer per-file expand so
  the user controls depth.
- Malformed paste: render as plain text rather than throwing.

---

## 7. Test plan (colocated parser tests)

- parses a multi-file unified diff: correct files, statuses, hunks, line
  numbers, per-file and total +/- counts.
- added / deleted / renamed file statuses detected.
- `maxLines` truncation sets `truncated` and stops cleanly at a line boundary.
- malformed / non-diff input degrades to a single text block, no throw.
- empty input yields empty `files`, zero counts.

View is thin over the parser; light RTL coverage for collapse, no screenshots.

---

## 8. Open questions

- **Where exactly in Evidence:** inline in the expanded source row, or in a
  **peek** drawer (Move B) opened from the row? (Lean: peek for large diffs,
  inline for small, decided by line count.)
- **Syntax highlighting:** none for v1 (a dependency and a calm-vs-color
  tradeoff); revisit only if users ask. The diff tones already carry the signal.
- **Word-level intra-line diff:** out of scope for v1; line-level is enough.
