# Claude project instructions · Mori

Read these before changing code or committing.

## Always

- Read [`docs/mori-project-goal.md`](docs/mori-project-goal.md) for product
  direction and what is implemented vs planned.
- Read [`docs/mori-autonomous-loop.md`](docs/mori-autonomous-loop.md) for how
  the development loop runs.
- Read [`docs/design/mori-brand-identity-reference.md`](docs/design/mori-brand-identity-reference.md)
  before any brand / icon / colour change.

## Commit messages — non-negotiable

Every commit MUST follow [`docs/commit-format.md`](docs/commit-format.md).
That file is the authoritative spec. The short form:

- Subject: `<type>: <imperative lower-case summary>`, no trailing period,
  under ~70 chars. Type is one of `feat`, `fix`, `refactor`, `test`,
  `docs`, `chore`.
- One blank line after the subject.
- Body is a **bullet list only**, each line starting with `- `. No prose
  paragraphs. No blank lines between bullets. 3–7 bullets is typical.
- Never include emoji, an AI footer, `Co-Authored-By:` lines,
  "Generated with" lines, validation logs, or filler.

Before running `git commit`, re-check the message against the spec.

## Validation before committing code changes

- `npm run check:full`
- `npm run build`
- `git diff --check`
- `git status --short`

If `src-tauri/` changed, also run `cargo check` and `cargo test` in that
directory.

## Writing style — non-negotiable

- Never use the em dash `—` anywhere: not in UI strings, not in code
  comments, not in docs or commit messages. Use `,` or `·` instead, or
  split into two sentences. (An en dash `–` inside a numeric range like
  `3–7` is fine; the banned character is the em dash `—`, U+2014.)

## Do not

- Push to the remote unless explicitly asked.
- Skip hooks (`--no-verify`) or bypass signing.
- Use `git rebase -i` or other interactive git commands; the harness has
  no terminal.
- Overpurple the UI. Brand purple is accent / identity only; status
  colours stay semantic (see brand identity reference).
