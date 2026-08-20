import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A design token may be defined once in the token layer.
 *
 * `--base-space-*` was defined in both `tokens.css` and `theme.css` with
 * different values. `theme.css` is imported second, so it won, and the comment
 * in `tokens.css` telling new code to use its scale documented 16px for
 * `--base-space-4` while 10px was what actually resolved. Every rule written
 * against the documentation was off by up to 6px a step, and nothing failed.
 *
 * Source order is load-bearing in this stylesheet layout, which is exactly why
 * a token that appears twice is a defect rather than an override: the winner
 * depends on import order in a different file.
 *
 * Scope is the two token files, not every stylesheet. Feature sheets override
 * tokens deliberately and under their own selectors; this is about the layer
 * that is supposed to be the single definition.
 */
const ROOT = join(__dirname, "..", "..");
const TOKEN_LAYER = ["src/styles/tokens.css", "src/styles/theme.css"];

/**
 * Custom properties declared in a plain `:root` block, per file.
 *
 * Plain `:root` only: a dark-mode or `[data-theme]` block redefining a colour
 * is the mechanism working, not a collision, and those carry a different
 * selector.
 */
function rootDefinitions(relativePath: string): string[] {
  const source = readFileSync(join(ROOT, relativePath), "utf8");
  const names: string[] = [];
  for (const block of source.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = block[1].trim().split("\n").pop()?.trim() ?? "";
    if (selector !== ":root") continue;
    for (const declaration of block[2].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
      names.push(declaration[1]);
    }
  }
  return names;
}

describe("design token layer", () => {
  it("defines every token exactly once", () => {
    const seen = new Map<string, string[]>();
    for (const file of TOKEN_LAYER) {
      for (const name of rootDefinitions(file)) {
        seen.set(name, [...(seen.get(name) ?? []), file]);
      }
    }

    // A parse that found almost nothing would pass the check below while
    // proving nothing, so the count is asserted first.
    expect(seen.size).toBeGreaterThan(100);

    const duplicated = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(
      duplicated,
      `defined more than once in the token layer:\n  ${duplicated.join("\n  ")}`,
    ).toEqual([]);
  });

  it("still defines the spacing scale, in theme.css", () => {
    // The removal was of the shadowed copy, not of the scale. If this ever goes
    // empty, spacing has been deleted rather than deduplicated.
    const spacing = rootDefinitions("src/styles/theme.css").filter((name) =>
      name.startsWith("--base-space-"),
    );
    expect(spacing.length).toBeGreaterThan(5);
    expect(rootDefinitions("src/styles/tokens.css")).not.toContain("--base-space-4");
  });
});
