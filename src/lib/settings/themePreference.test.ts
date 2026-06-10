import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCE,
  SELECTABLE_THEMES,
  THEME_DEFINITIONS,
  getThemeColorScheme,
  isSelectableTheme,
  loadThemePreference,
  parseThemePreference,
  saveThemePreference,
  serializeThemePreference,
} from "./themePreference";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";

describe("isSelectableTheme", () => {
  it("accepts all runtime-selectable themes", () => {
    expect(isSelectableTheme("formal")).toBe(true);
    expect(isSelectableTheme("forest")).toBe(true);
    expect(isSelectableTheme("nightLake")).toBe(true);
  });

  it("rejects unknown themes and non-strings", () => {
    expect(isSelectableTheme("bogus")).toBe(false);
    expect(isSelectableTheme(42)).toBe(false);
    expect(isSelectableTheme(null)).toBe(false);
  });
});

describe("theme definitions", () => {
  it("defines display metadata for every selectable theme", () => {
    expect(Object.keys(THEME_DEFINITIONS).sort()).toEqual([...SELECTABLE_THEMES].sort());
  });

  it("exposes the color scheme from the central theme definition", () => {
    expect(getThemeColorScheme("formal")).toBe("light");
    expect(getThemeColorScheme("forest")).toBe("light");
    expect(getThemeColorScheme("nightLake")).toBe("dark");
  });
});

describe("parseThemePreference", () => {
  it("returns the default for null or empty input", () => {
    expect(parseThemePreference(null)).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference("")).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  it("returns the default for malformed JSON", () => {
    expect(parseThemePreference("{not json")).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  it("falls back to the default on a schema-version mismatch", () => {
    expect(
      parseThemePreference(JSON.stringify({ schemaVersion: 99, theme: "forest" })),
    ).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  it("falls back to the default for an unknown theme", () => {
    expect(
      parseThemePreference(JSON.stringify({ schemaVersion: 1, theme: "bogus" })),
    ).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  it("round-trips a valid preference — forest", () => {
    const stored = serializeThemePreference({
      ...DEFAULT_THEME_PREFERENCE,
      theme: "forest",
      fontScale: "small",
    });
    expect(parseThemePreference(stored).theme).toBe("forest");
    expect(parseThemePreference(stored).fontScale).toBe("small");
  });

  it("round-trips a valid preference — nightLake", () => {
    const stored = serializeThemePreference({
      ...DEFAULT_THEME_PREFERENCE,
      theme: "nightLake",
      fontScale: "xlarge",
    });
    expect(parseThemePreference(stored).theme).toBe("nightLake");
    expect(parseThemePreference(stored).fontScale).toBe("xlarge");
  });

  it("falls back to the default font scale for an unknown value", () => {
    const stored = JSON.stringify({
      schemaVersion: 2,
      theme: "forest",
      fontScale: "gigantic",
    });
    expect(parseThemePreference(stored).fontScale).toBe("normal");
  });

  it("migrates v1 theme-only preferences", () => {
    const stored = JSON.stringify({ schemaVersion: 1, theme: "forest" });
    expect(parseThemePreference(stored)).toEqual({
      ...DEFAULT_THEME_PREFERENCE,
      theme: "forest",
    });
  });
});

describe("loadThemePreference / saveThemePreference", () => {
  it("defaults to the formal theme when nothing is stored", () => {
    expect(loadThemePreference(new MemoryKeyValueStorage())).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
  });

  it("persists and reloads the forest theme", () => {
    const storage = new MemoryKeyValueStorage();
    saveThemePreference({ ...DEFAULT_THEME_PREFERENCE, theme: "forest" }, storage);
    expect(loadThemePreference(storage).theme).toBe("forest");
  });

  it("persists and reloads the nightLake dark theme", () => {
    const storage = new MemoryKeyValueStorage();
    saveThemePreference({ ...DEFAULT_THEME_PREFERENCE, theme: "nightLake" }, storage);
    expect(loadThemePreference(storage).theme).toBe("nightLake");
  });

  it("recovers the default when storage holds an unknown theme", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.themePreference",
      JSON.stringify({ schemaVersion: 2, theme: "unknownFutureDarkMode" }),
    );
    expect(loadThemePreference(storage).theme).toBe("formal");
  });
});
