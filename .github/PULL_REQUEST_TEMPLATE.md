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

- [ ] `npm run check:full`
- [ ] `npm run build`
- [ ] `npm run style:check`
- [ ] `cargo check` + `cargo test` (only if `src-tauri/` changed)
- [ ] Exercised the real flow in the app · describe it below

<!-- Describe the walkthrough, or attach a screenshot, for anything user-facing. -->

## Notes

<!-- Trade-offs, follow-ups, anything deliberately left out. -->
