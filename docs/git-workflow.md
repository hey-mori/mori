# Git & GitHub workflow

How work moves from an idea to `main` in this repo. Commit *message* format is a
separate, stricter contract in [`commit-format.md`](commit-format.md); this file
covers branches, pull requests, issues, CI, and releases.

## 1. The model: GitHub Flow, adapted

`main` is always releasable. Work happens on short-lived branches that merge
back through a pull request. There is no `develop`, no `release/*`, no
`hotfix/*`. Git Flow's release-train shape solves a problem Mori does not have
(no versioned boxed releases, no parallel maintained majors).

The adaptation is deliberate and is documented here rather than left implicit:
Mori is built by one maintainer plus AI agents, one of which (the autonomous
loop, see [`mori-autonomous-loop.md`](mori-autonomous-loop.md)) commits directly
to `main` during a session. A rule that pretends otherwise would be broken daily
and would make the history *less* honest, not more. See §6.

## 2. Branch naming

```
<type>/<area>-<slug>
```

`<type>` matches the commit-message type vocabulary, so a branch and its commits
agree: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Add `spike/` for
throwaway investigation branches that are never merged.

```
feat/language-g0-uia-spike
fix/storage-quota-loop
refactor/empty-state-unification
docs/rebaseline-production-program
chore/github-workflow-setup
```

Branches are short-lived, hours to a few days, and deleted after merge. A
branch that cannot merge within a few days is a sign the unit of work is too
large and should be split.

## 3. The cycle

1. **Issue first** for anything non-trivial. It records the *why* and the
   evidence (file:line), so the PR can stay about the change.
2. **Branch** from an up-to-date `main`.
3. **Commit** per [`commit-format.md`](commit-format.md). Small, meaningful
   commits: the merge preserves them (see §4), so they are the durable record.
4. **Validate locally** before pushing: `npm run check:full`, `npm run build`,
   `npm run style:check`, and `cargo check` / `cargo test` when `src-tauri/`
   changed.
5. **Pull request** using the template. Link the issue with `Closes #N` so the
   issue closes on merge and the trail is traceable both directions.
6. **CI must be green** before merge.
7. **Merge, then delete the branch.**

## 4. Merge policy: merge commit, not squash

Merge with `--no-ff` (GitHub's "Create a merge commit").

The reason is specific to this repo: `commit-format.md` already forces every
commit to be a well-formed, self-contained statement of one change. Squashing
would throw that work away and collapse a reviewed series into a single blob.
Keeping the commits preserves the reasoning trail; the merge commit preserves
the PR boundary. Rebase-merge is also rejected because it rewrites SHAs that may
already be referenced in issues, notes, or another machine's checkout.

Never force-push a branch that others (or another machine) may have pulled.
Never rewrite `main`.

## 5. Pull requests

A PR body states what changed, why, and **how it was verified**. That last part
is not optional, because a green typecheck is not evidence that a user-facing
change works (see the verification rule in `CLAUDE.md`). Screenshots or a
described real-app walkthrough belong here.

PRs are small enough to read in one sitting. If a PR touches more than a couple
of areas, it is usually two PRs.

Self-merge is normal here, and is not a substitute for review: the review step
is the author re-reading the diff against the issue plus a green CI run.

## 6. The direct-to-`main` exception (deliberate)

Direct commits to `main` are allowed for:

- The autonomous loop's own session work, which is its documented operating
  mode.
- `docs:` and `chore:` changes under roughly 20 lines.
- Restoring a broken `main` (a revert or a build fix), where opening a PR would
  leave the branch broken for longer.

Everything else goes through a PR. This is a policy, not an accident: `main` is
protected by convention and CI rather than by a hard branch-protection rule,
because a hard rule would block the autonomous loop. If the loop later learns to
branch, hard protection becomes the better setting and this section should be
revisited.

## 7. Language

Repository artifacts are written in **English**: commit messages, branch names,
issue titles and bodies, pull requests, code comments, and these docs. The
product's own UI copy is Korean-first (see `CLAUDE.md`), and that split is
deliberate: the app speaks to its user in Korean, the repository speaks to
whoever maintains it.

Korean may appear inside an English issue when quoting a UI string, a screen
name (기록, 세션), or user feedback verbatim. Quoting the product is not the same
as writing the issue in Korean.

## 8. Issues

Issues carry labels along three axes so the backlog can be sliced by surface,
kind, and urgency:

- `area:*` · which surface (`기록`, `세션`, `언어`, `디자인시스템`, `저장소`, …)
- `type:*` · `bug`, `feature`, `design-debt`, `dead-code`, `docs`, `decision`
- `priority:*` · `high`, `medium`, `low`

`type:decision` marks an issue that is blocked on a product judgement rather
than on engineering, so the backlog never hides a question behind a task.

Milestones map to the completion program (M0–M4), so an issue's milestone
answers "which release does this belong to".

## 9. CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to
`main` and on every pull request: typecheck, the full Vitest suite, the
production build, stylelint, the unused-file inventory, and the Rust
check/test pass.

The Rust job is path-filtered to `src-tauri/**` changes. It runs on a macOS
runner because macOS is the first shipping target and needs no extra system
packages for tauri/wry, but that runner bills at a 10x minute multiplier on a
private repo, so running it on every frontend-only commit is pure waste.

## 10. Releases

Tag a release when a milestone completes: `v0.9.0` for M0, and so on, with notes
summarizing the merged pull requests. The tag is what makes the program's
progress legible from outside the repo.
