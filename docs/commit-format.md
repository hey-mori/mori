# Mori Commit Message Format

Every commit in this repository follows one fixed format. It is not a
preference · treat it as a hard rule, the same way the validation
contract is a hard rule.

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
  - Starts with a `type:` prefix · one of `feat`, `fix`, `refactor`,
    `test`, `docs`, `chore`.
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
