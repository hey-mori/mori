import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";

/**
 * A surface fill may not be a hardcoded white.
 *
 * Mori has a dark theme, applied by `[data-base-theme="nightLake"]` remapping
 * the tokens. A rule that paints `white` opts out of that, so the element stays
 * white while everything around it goes dark. Eleven rules did, including the
 * settings sheet, the right-hand inspector, and the sidebar search on focus:
 * surfaces the user sees constantly.
 *
 * These are not deliberate light-mode designs. Their neighbours already use
 * tokens: the project modal's textarea sets `color: var(--text)` and
 * `border: 1px solid var(--line)` and then painted `background: white`. The
 * intent was the theme; the background was the one property left behind.
 *
 * Scope is `background`, not `color`. White text on a saturated fill is
 * correct in both themes and is a different question.
 */
const ROOT = join(__dirname, "..", "..");
const WHITE = /background(?:-color)?:\s*(?:white|#fff|#ffffff)\s*;/i;

/**
 * Rules that may still paint white, with the reason.
 *
 * Not a way to opt out. Each entry is a rule whose whole palette is hardcoded,
 * so swapping one property would leave it half themed and looking worse than
 * it does now.
 */
const ALLOWED: ReadonlyArray<{ selector: string; because: string }> = [
  {
    selector: ".workspace-error-boundary-reset",
    because:
      "sits on a warm error card and hardcodes its brown text and border too, so it needs the block themed rather than this one property swapped",
  },
];

function cssFiles(): string[] {
  return [
    ...globSync("src/styles/**/*.css", { cwd: ROOT }),
    ...globSync("src/components/**/*.css", { cwd: ROOT }),
  ].map((file) => file.replace(/\\/g, "/"));
}

/** Every rule painting a hardcoded white, as `file:line selector`. */
function whiteSurfaces(): Array<{ file: string; line: number; selector: string }> {
  const found: Array<{ file: string; line: number; selector: string }> = [];
  for (const file of cssFiles()) {
    const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
    let selector = "";
    lines.forEach((text, index) => {
      const trimmed = text.trim();
      if (trimmed.endsWith("{") && !trimmed.startsWith("@")) {
        selector = trimmed.slice(0, -1).trim();
      }
      if (WHITE.test(text)) found.push({ file, line: index + 1, selector });
    });
  }
  return found;
}

describe("themed surfaces", () => {
  it("paints no surface a hardcoded white", () => {
    const files = cssFiles();
    // A glob that matched nothing would pass the check below while proving
    // nothing.
    expect(files.length).toBeGreaterThan(10);

    const allowed = new Set(ALLOWED.map((entry) => entry.selector));
    const offenders = whiteSurfaces()
      .filter((hit) => !allowed.has(hit.selector))
      .map((hit) => `${hit.file}:${hit.line} ${hit.selector}`);

    expect(
      offenders,
      `these stay white in dark mode; use var(--panel) or the right surface token:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps every allowance real", () => {
    // An allowance for a rule that no longer paints white is a stale exception
    // that would quietly permit a future one under the same selector.
    const present = new Set(whiteSurfaces().map((hit) => hit.selector));
    for (const entry of ALLOWED) {
      expect(present, `${entry.selector} no longer needs its allowance`).toContain(entry.selector);
    }
  });
});
