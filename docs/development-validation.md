# Development Validation

This file documents fast feedback during iteration. The repository's
verification contract is [`scripts/check.sh`](../scripts/check.sh), described
in [git-workflow.md](git-workflow.md#9-verification). The npm commands below
remain useful for iteration, but do not replace that gate.
Skipping validation is never acceptable; running validation
indiscriminately wastes time.

## Measured bottleneck

| Step                             | Cold        | Warm (cached) | Note |
| -------------------------------- | ----------- | ------------- | ---- |
| `npm run check:types` (tsc)      | ~13–20 s    | ~3–4 s        | **biggest cost** without cache; incremental cache slashes this |
| `npm test` (vitest, 600+ tests)  | ~9–10 s     | ~9 s          | Actual test execution is <2 s; module load dominates |
| Single test file via `node scripts/run-tests.mjs vitest path/to/file.test.ts` | ~5 s | ~3 s | Cold start cost amortized when running multiple |
| `npm run build` (`tsc && vite build`) | ~10–15 s | ~7 s   | Vite production bundle; only matters before release |
| `cargo test` (src-tauri)         | <0.1 s      | <0.1 s        | Negligible |

Test count is **not** the dominant cost today. TypeScript compile time
is. That's why this milestone enabled `incremental` in `tsconfig.json` ·
it writes a build info cache to `node_modules/.cache/mori-tsbuildinfo`
and reuses it on subsequent runs.

## Validation scripts

| Script                        | What it does                                     | When to run |
| ----------------------------- | ------------------------------------------------ | ----------- |
| `npm run check:types`         | `tsc --noEmit` (incremental)                     | After meaningful TS edits |
| `npm run test:unit`           | `run-tests.mjs vitest` (bounded `vitest run`)    | Full suite, one-shot |
| `npm run test:watch`          | `vitest` (interactive watch)                     | Long iteration sessions |
| `npm run test:changed`        | `run-tests.mjs vitest --changed` (git-aware)     | Quick feedback after small edits |
| `npm run check:quick`         | typecheck + changed-tests                        | During iteration |
| `npm run check:full`          | typecheck + full test suite                      | Iteration or diagnosis |
| `npm run check:release`       | typecheck + tests + production build             | Iteration or diagnosis |
| `npm test`                    | Original alias, equivalent to `test:unit`        | Unchanged for compatibility |
| `npm run typecheck`           | Original alias, equivalent to `check:types`      | Unchanged for compatibility |
| `npm run build`               | `tsc && vite build` (production bundle)          | Release preparation |

The original three commands (`npm test`, `npm run typecheck`,
`npm run build`) are kept as-is so existing muscle memory, scripts, and
documentation keep working.

## Recommended workflow

### During iteration (small edits, repeated)

```
npm run test:changed       # ~3 s for typical single-file edits
npm run check:types        # ~3 s warm; ~13 s the first time after pull
```

Or run a single test file directly:

```
node scripts/run-tests.mjs vitest src/lib/foo/bar.test.ts
```

For longer sessions, leave `npm run test:watch` running in another
terminal · it re-runs only affected tests on save.

### Before commit (always)

```
scripts/check.sh
```

The script selects the required checks for the changed scope. **Do not commit
without this passing.** It covers more than `check:full`, including style and
the relevant Rust checks.

### Before push / milestone handoff

```
scripts/check.sh --full
```

This widens the gate to the production build, unused-file inventory, and
relevant Rust pass. It is mandatory before letting a milestone reach `origin`.

### When desktop / Rust code changed

If you touched `src-tauri/` (Rust sources, Cargo.toml, command surface,
SQLite schema), the canonical script includes Rust checks. For a focused
diagnostic run, use:

```
cd src-tauri
cargo check
cargo test
cd ..
```

`cargo test` is fast (<0.1 s for the current 32-test suite) · there's no
reason to skip it when the desktop layer is touched.

## TypeScript incremental cache

The cache lives at `node_modules/.cache/mori-tsbuildinfo`. It survives
across runs of `npm run check:types` and `npm run build` and is
automatically gitignored (it sits under `node_modules/`).

**If `check:types` behaves strangely** (false positives, stale errors,
"file not found"):

```
rm -f node_modules/.cache/mori-tsbuildinfo
npm run check:types
```

The cache regenerates on the next run.

Reinstalling dependencies (`npm ci`, `rm -rf node_modules && npm i`)
also clears the cache automatically.

## How `test:changed` decides what to run

`vitest run --changed` compares the working tree against `HEAD` and runs
test files whose import graph includes any changed file. Consequences:

- Editing a single helper file → runs only that helper's tests + tests
  that import it.
- Editing `package.json` or `tsconfig.json` → vitest conservatively
  reruns everything (config affects the whole graph).
- Editing only docs → no tests run.
- No git history (e.g. shallow checkout without `.git`) → falls back to
  running the full suite, just like `npm test`.

This is the right tradeoff: cheap when you're iterating on one file,
honest when something fundamental changes.

## Agent validation policy

When an agent (Claude Code or any contributor) iterates on a milestone:

- **Do not** run `npm run check:full` after every small edit. Use
  `npm run check:quick` or a targeted `node scripts/run-tests.mjs vitest <file>` instead.
- **Do not** run `npm run build` repeatedly during iteration. Run it
  once at the end (or via `check:release`).
- **Do** run `scripts/check.sh` before committing.
- **Do** run `scripts/check.sh --full` before pushing or handing the
  milestone off.
- **Do** run `cargo check` + `cargo test` as focused diagnostics when desktop
  code changes; the canonical script also runs them when required.
- **Always** report exactly which checks were run, with their results.
  Never claim "tests passed" if only typecheck or a single file ran.

## Notes and limits

- The `build` script still runs `tsc` once before `vite build` for
  belt-and-suspenders. When `check:release` runs `check:types` first
  this means TypeScript is invoked twice · but the second invocation
  hits the incremental cache and adds only ~3 seconds. Acceptable for
  the safety it provides.
- This milestone deliberately did NOT introduce pre-commit hooks,
  Husky, or other tooling. The validation scripts are enough; tooling
  can come later if the convention is broken in practice.
- Test count is not yet a real bottleneck. If the suite passes 1500
  tests and vitest start-up exceeds ~5 s, consider `vitest --shard` or
  splitting unit vs. integration. Today this is over-engineering.
