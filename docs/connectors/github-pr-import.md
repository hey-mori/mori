# GitHub PR / commit import (planning)

> **Status: Planned.** GitHub PR import is documented here so the shape
> of the future feature is clear, but no GitHub OAuth, no PR fetcher,
> and no commit auto-import exists today. The capture-surface row
> `githubPrImport` in `src/lib/connectors/captureSurfaces.ts` is
> tagged `planned` and unit-tested to confirm it does not claim to
> enter Import Review or create sources today.

## Today's user path (manual)

Until the feature lands, GitHub PRs reach Mori through the existing
import surfaces:

- **PR description / review comments** → Evidence Hub → URL paste (for
  the link) plus Manual Note (for the body).
- **PR diff** → Evidence Hub → Git diff paste (the diff itself) or the
  Tauri Git diff capture against the local checkout of the PR branch.
- **Codex / Claude PR conversation** → Evidence Hub → AI 대화 paste.

This is exactly the same posture as Codex Web — see
[`desktop-web-capture.md`](./desktop-web-capture.md).

## What the planned import will do

When `githubPrImport` lands, the user flow is:

1. User pastes a GitHub PR URL (`https://github.com/<owner>/<repo>/pull/<n>`).
2. User pastes the PR body / latest review comments / a `git diff`
   summary into the same form.
3. Mori parses the structured fields out of the paste and normalises
   them into one `SourceRef` + several `TimelineEvent` candidates
   (PR title → top event, each comment → conversation event, the diff
   → fileCode event).
4. Mori routes the candidates through **Import Review** so the user
   accepts / discards each item before persistence.

The matching ConnectorEvent shape is the existing schema:

```jsonc
{
  "id": "pr-1234",
  "connectorId": "githubPrImport",
  "kind": "transcript_imported",
  "occurredAt": "2026-05-14T10:00:00Z",
  "sessionId": "pr-1234",
  "summary": "PR #1234: Make Issue Garden responsive",
  "git": {
    "repoPath": "octo/repo",
    "additions": 28,
    "deletions": 6,
    "files": [{ "path": "src/styles.css" }]
  },
  "privacy": { "captureMethod": "manual_paste", "rawDataPolicy": "summary_only" },
  "provenance": { "toolName": "github-pr-import", "toolVersion": "0.0.0" }
}
```

`normalizeConnectorEvents` already routes `githubPrImport` events to the
`gitDiff` source kind so they flow through the existing traceability
helpers.

## What the planned import will NOT do

- **No GitHub OAuth.** The first version of `githubPrImport` will
  never authenticate against GitHub. The user pastes the data
  themselves.
- **No `gh` / `git` auto-fetch.** If the user wants to capture an
  actual diff, they keep using the existing Git diff paste / Tauri
  Git diff capture.
- **No repository scanning.** GitHub PR import does not look at the
  filesystem; it only consumes the text the user pastes.
- **No private repo fetching.** Without OAuth, Mori cannot reach a
  private PR. Users would need to paste the body manually.
- **No agent-attribution magic.** If a PR was written with Codex /
  Claude, the user can tag the event in Import Review; Mori does not
  try to detect agent authorship.
- **No comment notification subscriptions.** Mori does not poll PRs.

## Future opt-in steps (separate milestones)

If a future milestone wants to go beyond manual paste:

1. **Local `gh` integration**: a Tauri command that runs `gh pr view`
   *only when the user clicks a "Fetch PR" button* and only for a URL
   the user typed. Same privacy posture as the existing Tauri Git diff
   capture.
2. **Browser extension assist**: a per-click "Add this PR to Mori"
   button that pulls page state via the browser extension once that
   surface lands. Still no background polling.
3. **Optional OAuth**: an explicit opt-in flow where the user pastes
   a fine-grained PAT (scope = `read:public_repo` only) that Mori
   stores **locally** and uses only for an explicit Fetch click. This
   is *Planned*; no token is stored today.

Each step would land as its own milestone with its own privacy review.

## Where this is encoded

- Capture-surface row: `src/lib/connectors/captureSurfaces.ts` →
  `githubPrImport` (status `planned`, `canEnterImportReview: false`).
- Normalizer routing: `src/lib/connectors/normalizeConnectorEvents.ts`
  maps `githubPrImport` → `gitDiff` source kind (so the eventual
  importer reuses the existing trace helpers).
- Tests: `captureSurfaces.test.ts` asserts `githubPrImport` cannot
  reach Import Review while it is `planned`. The
  `normalizeConnectorEvents.test.ts` "New connector ids" block
  exercises the routing rule.
