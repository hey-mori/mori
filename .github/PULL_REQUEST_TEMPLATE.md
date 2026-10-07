<!--
Keep this small enough to read in one sitting. If it touches more than a couple
of areas, it is usually two PRs.
-->

## What

<!-- One or two sentences. The commit messages carry the detail. -->

## Why

Closes #

## How it was verified

<!--
A green typecheck is not evidence that a user-facing change works. Say what you
actually drove, and where. Delete rows that do not apply.
-->

- [ ] `scripts/check.sh` (or `--full`) · paste the outcome. This runs whatever
      CI is doing, and CI runs the same script when it is available
- [ ] Exercised the real flow in the app · describe it below

<!-- Describe the walkthrough, or attach a screenshot, for anything user-facing. -->

## Not proven

<!--
What this PR does not show: runtime paths not driven, platforms not run (for
example the Rust pass without cargo), data not available. "None" is a claim;
make it only when true.
-->

## What went wrong on the way

<!--
Optional. A broken premise, a failed first approach, or a wrong assumption
worth keeping for the next reader. Delete the section when there is none.
-->

## Notes

<!-- Trade-offs, follow-ups, anything deliberately left out. -->
