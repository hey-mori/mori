# Git & GitHub workflow

How work moves from an idea to `main` in this repo. Commit *message* format is a
separate, stricter contract in [`commit-format.md`](commit-format.md); this file
covers branches, pull requests, issues, CI, and releases.

## 1. The model: GitHub Flow, adapted

`main` is always releasable. Work happens on short-lived branches that merge
back through a pull request. There is no `develop`, no `release/*`, no
`hotfix/*`. Git Flow's release-train shape solves a problem Mori does not have
(no versioned boxed releases, no parallel maintained majors).

Mori is built by one maintainer plus AI agents, including the autonomous loop
([`mori-autonomous-loop.md`](mori-autonomous-loop.md)). Agents follow the same
branch-and-PR cycle as the maintainer; the only direct-to-`main` cases are the
narrow ones in §6.

## 2. Branch naming

```
<type>/<area>-<slug>
```

`<type>` matches the commit-message type vocabulary, so a branch and its commits
agree: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`. Add `spike/` for
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

0. **Preflight.** `git fetch --prune`, then check open pull requests and
   related issues (`gh pr list`, `gh issue list`) and whether `main` moved.
   If another branch is already solving the problem, do not start a second
   one. Sessions run concurrently by design, and on one machine they can even
   share a working tree, so a HEAD SHA alone does not say what was tested.
1. **Issue first** for anything non-trivial. It records the *why* and the
   evidence (file:line), so the PR can stay about the change.
2. **Branch** from an up-to-date `main`.
3. **Commit** per [`commit-format.md`](commit-format.md). Small, meaningful
   commits: the merge preserves them (see §4), so they are the durable record.
4. **Validate locally** before pushing: `scripts/check.sh --full` (§9). It
   runs typecheck, tests, stylelint, the prose guard, the commit guards, the
   build, and the Rust pass when `src-tauri/` changed. `npm run check:full` is narrower (typecheck
   and tests only) and is not the gate.
5. **Pull request** using the template. Link the issue with `Closes #N` so the
   issue closes on merge and the trail is traceable both directions.
6. **The local gate must be green** before merge. If CI was dispatched for this
   change, its result must also be checked (§9).
7. **Merge, then delete the branch.**

## 4. Merge policy: merge commit, not squash

Merge with `--no-ff` (GitHub's "Create a merge commit"), in this order of
reasons:

1. **Commit SHAs are long-lived identifiers here.** Agent memory files, issue
   bodies, and hand-off notes cite them (`a512781`, `7b66d1e`, …) to point at a
   specific change. Rebase-merge replays branch commits as *new* SHAs, which
   silently breaks every one of those references, including on another machine
   picking the work up later.
2. **Sessions hand work to each other by commit.** Preserving the exact SHA a
   branch produced is what makes that hand-off reliable.
3. **The PR boundary stays in the graph**, so it is visible which commits were
   integrated as one reviewed unit, and one merge commit reverts the whole unit.
4. **Squashing would discard the commit discipline we pay for.**
   `commit-format.md` already forces every commit to be a well-formed statement
   of one change; collapsing a reviewed series into one blob throws that away.

What this policy does **not** claim: merge commits are not a concurrency
control. When `main` moves under a branch, both rebase and merge have to
integrate and both can conflict. Parallel work is isolated by short-lived
branches and pull requests instead of direct pushes to `main` (§6), and that,
not the merge strategy, is what makes concurrent sessions safe.

The cost is a busier graph. That is accepted.

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
is the author re-reading the diff against the issue plus a recorded local gate
result (and a dispatched CI result when one was requested).

## 6. The direct-to-`main` exception (narrow)

Direct commits to `main` are allowed for exactly two cases, and both are the
owner's call. The `pre-push` hook (§9) refuses every push to `main`, so taking
one of them means bypassing it knowingly with `git push --no-verify`; an agent
never does that on its own initiative.

- A non-executing documentation fix: a typo, a broken link, a stale path.
- Restoring an already-broken `main`, where opening a PR would leave the branch
  broken for longer.

Everything else goes through a pull request, **including work by an autonomous
agent**. An earlier version of this document exempted the autonomous loop on the
grounds that direct commits were its documented operating mode. That exemption
was wrong and has been removed: it contradicted the first line of this document
("`main` is always releasable"), and an agent whose work nobody reviewed needs
more isolation than a human contributor, not less. `docs/mori-autonomous-loop.md`
§6 now carries the same branch-and-PR rule.

`main` is still protected by convention rather than a hard branch-protection
rule, because the repository is private on a plan where protection rules are not
available. That is a platform limitation, not a preference: when the constraint
lifts, turn protection on.

## 7. Language

Repository artifacts are written in **English**: commit messages, branch names,
issue titles and bodies, labels, milestones, pull requests, code comments, and
these docs. The product's own UI copy is Korean-first (see `CLAUDE.md`), and
that split is deliberate: the app speaks to its user in Korean, the repository
speaks to whoever maintains it.

**Refer to a screen by its code identifier, not its UI label.** The codebase
already has an English name for every surface (`ViewKey` is `ledger`,
`sessions`, `connections`, `dashboard`, never the Korean label), so an issue
titled "Connections import buttons lead to a dead end" matches the code, while
one titled "연동 import buttons…" matches neither the code nor a reader.

**Do not transcribe a mixed-language source. Paraphrase it and cite it.** A
docblock that reads "This is the 두 경험 + 교차 렌즈 rail: 기록 (notes · edit)…"
is not readable to anyone, in any language. Quoting it verbatim does not
preserve fidelity, it just moves the problem into the issue. Summarize the
meaning in English and cite `file:line` so the original stays one click away.

The only place a Korean string belongs in an English artifact is when the exact
characters are the subject: a copy change, a rendered-text bug, a label being
added or removed. Then quote it as a string, and say what it means.

**Identifiers are ASCII; prose follows the writing style.** `CLAUDE.md` bans the
em dash in prose and offers `·` as the replacement, and that rule governs UI
strings, comments, docs, and commit bodies. It does not govern *identifiers*.

A label name, a milestone title, and a branch name are typed into a shell,
pasted into a URL, and matched by scripts. A non-ASCII character in one becomes
percent-encoded noise (`M0 · Solid ground` turns into
`milestone%3A%22M0%20%C2%B7%20Solid%20ground%22`) and has to be reproduced
exactly to filter on it. So identifiers use plain ASCII and no decorative
separator:

```
M0 Solid ground          not  M0 · Solid ground
area:ledger              not  area:기록
fix/storage-quota-loop   not  fix/저장소-quota
```

The description field is prose, and follows the prose rule.

## 8. Issues

Issues carry labels along three axes so the backlog can be sliced by surface,
kind, and urgency:

- `area:*` · which surface, named by its code identifier, not its UI label:
  `ledger`, `sessions`, `language`, `design-system`, `storage`, `shell`
- `type:*` · `bug`, `feature`, `design-debt`, `dead-code`, `docs`, `decision`
- `priority:*` · `high`, `medium`, `low`

`type:decision` marks an issue that is blocked on a product judgement rather
than on engineering, so the backlog never hides a question behind a task.

Milestones map to the completion program (M0–M4), so an issue's milestone
answers "which release does this belong to".

## 9. Verification

One script defines "verified", and both a local run and CI call it:

```
scripts/check.sh          typecheck · tests · stylelint
scripts/check.sh --full   the above plus build, unused inventory, cargo
```

CI must never re-list these commands in YAML. If it did, the local rule and the
CI rule would drift, and the PR checklist would start meaning two things.

The gate also runs the commit guards: every commit on the branch must pass
`scripts/validate-commit-message.sh`, and every script and hook must be tracked
as executable (`100755`), because a Windows checkout does not preserve the bit
and git silently ignores a hook without it.

Local hooks live in `.githooks/` and are installed once per clone with
`scripts/setup-git-hooks.sh`: `commit-msg` rejects a malformed message before
the commit exists, and `pre-push` refuses a direct push to `main` (§6). Hooks
are a convenience that `--no-verify` or an unconfigured clone skips; the gate is
the enforcement.

The script widens its own scope automatically: a change to a lockfile, a build
config, `scripts/`, or a workflow forces the full pass, because those files can
break an area the diff never mentions.

**The remote CI is manual-only.** Hosted jobs were rejected before starting
when this account's Actions allowance was spent, producing a red failure with
zero steps. That happened from 2026-07-24, cleared, and returned on 2026-08-07.
The Linux verification jobs now use a dedicated self-hosted runner; the macOS
Rust job still uses a metered hosted runner. Automatic triggers remain disabled
in the workflow, so no run is implied by a push or a pull request.

So the gate is `scripts/check.sh`, run locally and recorded in the pull request
under "How it was verified". A hand-started run (`workflow_dispatch`) adds a
clean-checkout check when its jobs actually execute; inspect each job's steps
and result, especially the hosted macOS job. It is worth asking for when a change touches
dependencies, the toolchain, or the order stages run in. Those are the things a
local run structurally cannot see, because it uses a working tree that already
holds whatever earlier work left in it.

Section 3 requires a green local gate before merge. A dispatched CI run adds a
clean-checkout signal; record its result separately rather than inferring it
from the local run.

The macOS Rust job stays behind `workflow_dispatch`. It is asked for when
needed rather than run on every push.

Stating a rule the tooling cannot enforce would make this document decorative.
This section says what is actually true.

## 10. Releases

Tag a release when a milestone completes: `v0.9.0` for M0, and so on, with notes
summarizing the merged pull requests. The tag is what makes the program's
progress legible from outside the repo.
