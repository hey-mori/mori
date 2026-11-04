# Screen references

This folder held AI-generated design references for Mori, made from the prompts
in [docs/product-screen-prompts.md](../../product-screen-prompts.md) during
planning in 2026-05. They were **not screenshots of Mori**, and 36 of them were
removed from the tree on 2026-11-03, before the repository was opened, because:

- most showed a photo-realistic person who does not exist, as the signed-in
  user;
- they carried other products' logos (Google, GitHub, Figma, Notion, Slack,
  Chrome, VS Code and others) as if Mori integrated with all of them;
- many showed features Mori does not have and has dropped, such as account
  sign-in, plans, passkeys and cloud connectors, and one credited a company,
  "Mori, Inc.", that does not exist.

Read beside the product, they said more than is true. What each one was for is
still described in words in
[docs/product-screen-reference.md](../../product-screen-reference.md),
[docs/ux-reference.md](../../ux-reference.md) and the design notes that pointed
to them.

They remain in Git history. To see one, find the commit that removed them and
show the file from its parent:

```bash
git log --diff-filter=D --format='%h %s' -- docs/assets/screenshots
git show <that commit>^:docs/assets/screenshots/timeline-main-reference.png > timeline-main-reference.png
```

What stays here:

- `mori-icon-size-preview.png`: a rendering of Mori's own app icons at each
  packaged size, generated from the brand mark by `scripts/generate-icons.cjs`.

## Product screenshots

These are screenshots of Mori itself, used in the README. They were taken on
2026-11-04 from the browser build (`npm run dev`) at 1440×900, driven by
Playwright in headless Chromium. The browser build runs the same interface as
the desktop app, with the browser store instead of SQLite.

- `mori-home.png` shows the built-in demo data (the
  "데모 미리보기" mode a fresh install opens in). Its projects and sessions are
  invented.
- `mori-records.png` shows three records typed into the record composer, with
  invented content.
- `mori-session-review.png` shows a session created from a pasted transcript
  written for the screenshot, about an invented demo shop, analysed by the
  rule-based engine, with no model involved.

No real session, file, path or person appears in them. Retake them when the
screens they show change.
