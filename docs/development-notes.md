# Development Notes

This document records the current repository state and near-term engineering notes. It is intentionally honest about known issues and does not fix them.

## Current Branch/State

As of this documentation pass, the repository worktree contains many untracked project files. The documentation commit for this task should stage only `README.md` and files under `docs/`.

Current visible structure includes:

- `README.md`
- `docs/`
- `index.html`
- `package.json`
- `package-lock.json`
- `src/`
- `tsconfig.json`
- `vite.config.ts`

## Current Known Build/Typecheck Issue

The active app entrypoint is `src/main.tsx`, which imports `src/app/App.tsx`.

`src/app/App.tsx` imports view components from `src/features/*`, but those feature view files are not present yet. Because of that, `npm run typecheck` and `npm run build` are known to fail.

Additional known TypeScript issues from the previous README validation:

- `src/domain/mock-data.ts` imports `GitDiff` from `lucide-react`, but the installed version does not export that member.
- `src/lib/timeline/layout.ts` has a `Record<EventType, TimelineEvent[]>` construction issue.
- `src/lib/timeline/layout.ts` uses `Array.prototype.at`, but the current `tsconfig.json` targets `ES2020` libs.
- `npm run test` is configured with Vitest but currently finds no test files.

Do not fix these in documentation-only tasks.

## What Should Be Fixed Next

The next coding task should restore a compiling frontend entrypoint.

Recommended options:

1. Implement the missing feature view files under `src/features/*`.
2. Or intentionally wire `src/main.tsx` back to the existing single-file prototype in `src/App.tsx` while the modular feature files are being created.

After the entrypoint compiles, add focused tests for:

- timeline layout
- relationship traversal
- trust/privacy helpers
- resume prompt generation
- domain data shape assumptions

## Documentation-Only Changes Made In This Task

- Added canonical product spec at `docs/product-spec.md`
- Added UX reference at `docs/ux-reference.md`
- Added screenshot assets under `docs/assets/screenshots/`
- Updated architecture documentation
- Updated domain model documentation
- Updated roadmap documentation
- Updated development notes
- Added README links to the documentation set

No application code, source files, package files, dependency files, or build configuration files should be changed by this task.

## Recommended Next Coding Task

Restore the app to a compiling state without changing product behavior:

- decide whether `src/app/App.tsx` or `src/App.tsx` is the intended active entrypoint
- implement or reconnect the missing feature views
- replace the invalid `GitDiff` icon import with an icon exported by the installed `lucide-react`
- adjust the timeline layout helper or TypeScript lib target intentionally
- add the first Vitest tests for pure helpers
