import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every rendered surface must have a way in.
 *
 * `App.tsx` routes 25 view keys. Eight are in the sidebar rail, twelve in the
 * command palette, and the rest are reached in context: a session tab, a project
 * card, a companion strip. That is all fine. What is not fine is a surface that
 * is routed, lazily imported, rendered, and reachable from **nowhere**, which is
 * what `memoryHub` was: 337 lines, advertised in `featureStatus.ts`, that no
 * click anywhere could open (#4).
 *
 * That is easy to create and invisible afterwards. Retiring a surface is meant
 * to mean unwiring it from the rail and keeping it reachable, so a route with no
 * producer is neither retired nor live.
 *
 * ## Keys are grouped by the surface they render
 *
 * Six keys route to `SessionDetailView` and two to `MemoryView`: they are
 * aliases of one surface, reached by opening it and switching tabs. Checking
 * them individually reports six orphans that are nothing of the kind, which is
 * what the first version of this test did. A group is reachable when any key in
 * it is, which is what reachable means for a tab.
 *
 * ## What counts as a way in
 *
 * The rail, the palette, or anywhere in `src` that navigates to the key: a store
 * action setting `currentView`, or a component calling `onNavigate`. It does not
 * check that the producer is itself reachable, which would need the whole graph.
 * It checks that a surface is not orphaned outright, which is the failure that
 * actually happened.
 */
const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * The surfaces `App` renders, each with every view key that routes to it.
 *
 * Parsed from the render expressions, so aliases group themselves rather than
 * being listed here and going stale.
 */
function routedSurfaces(): Map<string, string[]> {
  const app = read("src/app/App.tsx");
  const surfaces = new Map<string, string[]>();
  const render = /\{(currentView === "[a-zA-Z]+"(?:\s*\|\|\s*currentView === "[a-zA-Z]+")*)\s*\?\s*<([A-Za-z]+)/g;
  for (const match of app.matchAll(render)) {
    const keys = [...match[1].matchAll(/"([a-zA-Z]+)"/g)].map((inner) => inner[1]);
    const component = match[2];
    surfaces.set(component, [...(surfaces.get(component) ?? []), ...keys]);
  }
  return surfaces;
}

function block(source: string, start: string): string {
  const from = source.indexOf(start);
  if (from === -1) return "";
  const to = source.indexOf("];", from);
  return to === -1 ? "" : source.slice(from, to);
}

function railViews(): string[] {
  const rail = block(read("src/components/layout/Sidebar.tsx"), "const PRIMARY_NAV");
  return [...rail.matchAll(/key: "([a-zA-Z]+)"/g)].map((match) => match[1]);
}

function paletteViews(): string[] {
  const commands = block(
    read("src/lib/commandPalette/commandPalette.ts"),
    "const NAVIGATE_COMMANDS",
  );
  return [...commands.matchAll(/view: "([a-zA-Z]+)"/g)].map((match) => match[1]);
}

/** Every source file that could navigate, concatenated once. */
function sourceTree(): string {
  const files = globSync("src/**/*.{ts,tsx}", { cwd: ROOT }).map((file) =>
    file.split("\\").join("/"),
  );
  return files
    .filter((file) => !file.endsWith("App.tsx") && !file.includes(".test."))
    .map((file) => read(file))
    .join("\n");
}

describe("view reachability", () => {
  it("gives every rendered surface a way in", () => {
    const surfaces = routedSurfaces();
    const rail = new Set(railViews());
    const palette = new Set(paletteViews());

    // A parse that found nothing would pass the check below while proving
    // nothing about the app.
    expect(surfaces.size).toBeGreaterThan(10);
    expect(rail.size).toBeGreaterThan(4);
    expect(palette.size).toBeGreaterThan(4);

    const producers = sourceTree();
    const reachable = (key: string) =>
      rail.has(key) ||
      palette.has(key) ||
      producers.includes(`currentView: "${key}"`) ||
      producers.includes(`onNavigate("${key}")`) ||
      producers.includes(`setCurrentView("${key}")`);

    const orphans = [...surfaces.entries()]
      .filter(([, keys]) => !keys.some(reachable))
      .map(([component, keys]) => `${component} (${keys.join(", ")})`);

    expect(
      orphans,
      `rendered but reachable from nowhere; add to the palette or give it a producer:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the retired memory hub reachable from the palette", () => {
    // The specific case #4 records, pinned by name: it is deliberately absent
    // from the rail, so the palette is the only thing keeping it from being
    // orphaned again.
    expect(railViews()).not.toContain("memoryHub");
    expect(paletteViews()).toContain("memoryHub");
  });
});
