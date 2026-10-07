# Claude project instructions · Mori

Read these before changing code or committing.

## Always

- Read [`docs/mori-project-goal.md`](docs/mori-project-goal.md) for product
  identity and what is implemented vs planned, then
  [`docs/design/mori-context-workspace-architecture.md`](docs/design/mori-context-workspace-architecture.md),
  the governing architecture (record kernel, pipeline, apply policy, IA,
  storage ADR, decision authority order, K1-K4 execution sequence).
  Existing Mori is material for future Mori, not its boundary; judge
  conflicts by that doc's §16 authority order.
- Before touching the 기록 workspace (record-ledger feature, composer,
  timeline, ledger calendar), read
  [`docs/design/record-workspace/README.md`](docs/design/record-workspace/README.md),
  the approved screen-level design set and stage roadmap. Keep its
  `worklog.md` current as you work.
- Read [`docs/mori-autonomous-loop.md`](docs/mori-autonomous-loop.md) for how
  the development loop runs.
- [`docs/production-program.md`](docs/production-program.md) is marked
  to-be-re-baselined; do not sequence new work from it.
- Read [`docs/design/mori-brand-identity-reference.md`](docs/design/mori-brand-identity-reference.md)
  before any brand / icon / colour change.
- Read [`docs/frontend-architecture.md`](docs/frontend-architecture.md) before
  any CSS or styling change.

## Branches, PRs, issues

Non-trivial work goes issue → branch → PR → local verification → merge, per
[`docs/git-workflow.md`](docs/git-workflow.md). Branches are
`<type>/<area>-<slug>` and short-lived; merges keep the commits
(`--no-ff`, never squash) because each commit is already a well-formed
record. That doc also states the deliberate direct-to-`main` exception
(the autonomous loop, and tiny `docs:`/`chore:` changes), so `main` is
protected by convention and the documented verification gate rather than a
hard rule. Remote CI is manual-only at present.

## Autonomy grades

Not every decision needs the same permission. Asking about all of them is
slow; asking about none of them is unsafe. Three grades, by what a wrong
call costs and whether it can be taken back.

**Proceed without asking.** Bug fixes. Tests. Performance work that does not
change behaviour. Correcting documentation or comments that a later change
made untrue. Removing provably dead code, subject to the retire-don't-delete
rule below. Refactoring inside an already-approved design. Local branches,
commits, and running the full validation set.

**Get the design approved first.** Database schema and migrations. What
storage owns which data. Navigation and information architecture. Capture
defaults, including when and what Mori reads. Privacy, retention and
deletion policy. The Mori and Mori Lens boundary. Anything that changes what
the product promises rather than how it keeps the promise.

**Wait for the owner to act or say so explicitly.** Pushing, opening or
merging a pull request. Releases, signing keys, distribution. Pricing and
licensing. Destructive operations on real user data.

That grant can be standing rather than per-action: "push and merge as you
go" covers the session it was given in, not the next one. Releases and
anything touching real user data are the exception and stay per-action.

Two rules that make the grades work:

- **Approve a program, not each step inside it.** Once a design is agreed,
  work through it autonomously and report at milestones. A milestone report
  says what shipped, what was verified and how, and what is still owed.
  Splitting out the part of a program that needs no approval, so it can ship
  while the rest waits, is grade one.
- **Report broken premises, loudly.** The most common real defect here is
  reasoning that was true when written and stopped being true in a later
  change that never touched it. Types, tests and lint cannot see those.
  Finding one is a result worth reporting, not a detour, and correcting it
  is grade one.

## Commit messages · non-negotiable

Every commit MUST follow [`docs/commit-format.md`](docs/commit-format.md).
That file is the authoritative spec. The short form:

- Subject: `<type>: <imperative lower-case summary>`, no trailing period,
  under ~70 chars. Type is one of `feat`, `fix`, `perf`, `refactor`,
  `test`, `docs`, `chore`. A commit made by `git revert` keeps git's own
  shape (see `docs/commit-format.md`).
- One blank line after the subject.
- Body is a **bullet list only**, each line starting with `- `. No prose
  paragraphs. No blank lines between bullets. 3–7 bullets is typical.
- Never include emoji, an AI footer, `Co-Authored-By:` lines,
  "Generated with" lines, validation logs, or filler.

Before running `git commit`, re-check the message against the spec.
`scripts/validate-commit-message.sh` is the executable form of it. Run
`scripts/setup-git-hooks.sh` once per clone so the `commit-msg` hook rejects a
bad message before the commit exists; `scripts/check.sh` checks the branch's
commits either way.

## Validation before committing code changes

- `scripts/check.sh` for the changed scope; `scripts/check.sh --full` before
  pushing or handing off a milestone. This is the same gate CI calls.
- `git diff --check`
- `git status --short`

The script includes the Rust pass when `src-tauri/` changed. Record which
checks actually ran; a manual-only remote workflow is not a substitute for
the local result.

## Writing style · non-negotiable

- Never use the em dash `—` anywhere: not in UI strings, not in code
  comments, not in docs or commit messages. Use `,` or `·` instead, or
  split into two sentences. (An en dash `–` inside a numeric range like
  `3–7` is fine; the banned character is the em dash `—`, U+2014.)

## UI / UX conventions

The user holds a high bar for a calm, dense, finished surface. Apply these
to every UI change (they come from repeated direct feedback):

- **Copy-diet.** Keep on-screen prose minimal. Move the "why / how" out of
  always-visible paragraphs and inline note boxes, into an info tooltip the
  user reveals on hover.
- **Info tooltips use `InfoHint`** (`src/components/ui/InfoHint.tsx`): a
  portal-rendered floating tooltip that overlays on top, is never clipped by
  an `overflow` ancestor, and never takes layout space. Reuse it; do not
  reinvent inline `<details>` help boxes that push content down.
- **No "AI-cliché" accents.** Never mark a selected card / row / tab with a
  left-border bar (`box-shadow: inset Npx 0 0 …`). Use a calm tint or a full
  border instead.
- **Fold planned / secondary items behind a `<details>` disclosure**
  ("예정 N개" ▶), never as full peer cards competing with the actionable
  ones. Lead with what works now.
- **Cut redundant metadata.** Per-row dates, a session count beside a project
  name, and transient status badges add noise; prefer the single calmest
  honest signal. Vertically centre a row's trailing arrow / action.
- **Korean-first UI copy.** User-facing strings are Korean (relative time
  reads "3시간 전", not "3h ago"). The canonical status vocabulary in the
  product-state model is the only deliberate exception.

## Frontend CSS

CSS lives in a layered hierarchy, all ordered by `src/styles/globals.css`:
tokens, theme, reset, app-shell, the component layer
(`src/components/ui/*.css`), then the feature sheets
(`src/styles/features/*.css`). See
[`docs/frontend-architecture.md`](docs/frontend-architecture.md) for the full
map and migration rules.

- Do not recreate a single monolithic stylesheet. New reusable component CSS
  goes in the component layer; new screen CSS goes in the owning feature sheet.
- Source order is load-bearing. Before relocating a rule, confirm the move is
  cascade-safe: the block is contiguous, and every external reference to its
  selectors is either a higher-specificity override (wins regardless of order)
  or absent. Verify with `npm run style:check`, `npm run build`, and a browser
  check that the affected screens render unchanged.

## Do not

- Push to the remote unless explicitly asked.
- Delete a screen or surface when it stops being used. Prefer to retire it:
  unwire it from navigation but keep the code reachable (a route or the command
  palette). Only delete code that is provably dead, never a whole feature view.
- Skip hooks (`--no-verify`) or bypass signing.
- Use `git rebase -i` or other interactive git commands; the harness has
  no terminal.
- Overpurple the UI. Brand purple is accent / identity only; status
  colours stay semantic (see brand identity reference).
