# Mori Commit Message Format

Every commit in this repository follows one fixed format. It is not a
preference · treat it as a hard rule, the same way the validation
contract is a hard rule.

The rule is enforced, not only stated: `scripts/validate-commit-message.sh`
implements this document, the `commit-msg` hook (installed by
`scripts/setup-git-hooks.sh`) runs it before a commit exists, and
`scripts/check.sh` runs it over every commit on the branch. If this document
and the validator disagree, fix both in the same change.

## Shape

```
<type>: <imperative summary>
                              ← one blank line
- <what changed / why>
- <what changed / why>
- <what changed / why>
```

## Rules

- **Subject line**
  - Starts with a `type:` prefix · one of `feat`, `fix`, `perf`,
    `refactor`, `test`, `docs`, `chore`. `perf` is for a change whose
    intent is speed or resource use, which is neither a bug fix nor a
    behaviour-preserving restructure. No other types (`build`, `ci`, …)
    until a real need is decided.
  - Do not add a scope. Use `feat: ...`, never `feat(scope): ...`.
  - The summary is a lower-case, imperative-mood English phrase
    ("add …", "make …", "stop …"), no trailing period.
  - Keep it under ~70 characters.
- **Body**
  - One blank line after the subject, then a **bullet list only**.
  - Every body line is a bullet starting with `- `.
  - **No prose paragraphs.** If a point needs explanation, it is
    still one bullet · write a fuller sentence in that bullet rather
    than dropping into paragraph form.
  - English. Each bullet states what changed or why.
  - 3–7 bullets is typical; a trivial change may have fewer.
  - A trivial, self-explanatory change (a typo, a broken link, a
    version bump) may be **subject-only** with no body. Padding a
    one-line fix out to three bullets produces filler, which is the
    thing the bullet rule exists to prevent.
  - The bullet-only rule is an anti-slop measure, not decoration: most
    commits here are written by an AI agent, and prose bodies drift
    into unfalsifiable summary ("improves the overall experience").
    Bullets force discrete, checkable claims.
- **Never include**
  - emoji, an AI footer, `Co-Authored-By:` lines, "Generated with"
    lines, validation logs, or "no changes" filler.
  - phase or section markers in the subject, such as `(P1)`,
    `(P2.5)`, `[Phase 1]`, or similar milestone labels.

## Special cases

Two kinds of commit are written by git or GitHub, not by hand, and keep
their generated shape. The attribution, emoji, and em-dash bans still
apply to both.

- **Merge commits:** `Merge pull request #N from …`, `Merge branch '…'
  into …`, and CI's `Merge <sha> into <sha>`. The body is whatever git
  or GitHub wrote.
- **Reverts made by `git revert`:** the subject `Revert "<original
  subject>"`, then one blank line, then git's own line
  `This reverts commit <full sha>.`. A reason may follow as a bullet
  list after one blank line. Any other `Revert …` subject is an ordinary
  commit and needs a type.

## Example

```
feat: filter a .mori package into a client-safe export

- Add buildClientSafeMoriPackage, a pure client-safe package transform
- Keep only clientSafe non-sensitive memory and its surviving audit rows
- Mark the manifest with an additive clientSafeExport flag, validated
- Add getPackageIsClientSafe and cover the filter and marker with tests
```

## Not this

A body written as prose paragraphs, even well-written prose, does
**not** conform. The body must be a bullet list.
