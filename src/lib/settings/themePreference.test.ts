import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCE,
  isSelectableTheme,
  loadThemePreference,
  parseThemePreference,
  saveThemePreference,
  serializeThemePreference,
} from "./themePreference";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";

describe("isSelectableTheme", () => {
  it("accepts the runtime-selectable themes", () => {
    expect(isSelectableTheme("formal")).toBe(true);
    expect(isSelectableTheme("forest")).toBe(true);
  });

  it("rejects the planned and unknown themes", () => {
    expect(isSelectableTheme("nightLake")).toBe(false);
    expect(isSelectableTheme("bogus")).toBe(false);
    expect(isSelectableTheme(42)).toBe(false);
    expect(isSelectableTheme(null)).toBe(false);
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

  it("falls back to the default for a planned or unknown theme", () => {
    expect(
      parseThemePreference(JSON.stringify({ schemaVersion: 1, theme: "nightLake" })),
    ).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(
      parseThemePreference(JSON.stringify({ schemaVersion: 1, theme: "bogus" })),
    ).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  it("round-trips a valid preference", () => {
    const stored = serializeThemePreference({ schemaVersion: 1, theme: "forest" });
    expect(parseThemePreference(stored).theme).toBe("forest");
  });
});

describe("loadThemePreference / saveThemePreference", () => {
  it("defaults to the formal theme when nothing is stored", () => {
    expect(loadThemePreference(new MemoryKeyValueStorage())).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
  });

  it("persists and reloads the selected theme", () => {
    const storage = new MemoryKeyValueStorage();
    saveThemePreference({ schemaVersion: 1, theme: "forest" }, storage);
    expect(loadThemePreference(storage).theme).toBe("forest");
  });

  it("recovers the default when storage holds a non-selectable theme", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.themePreference",
      JSON.stringify({ schemaVersion: 1, theme: "nightLake" }),
    );
    expect(loadThemePreference(storage).theme).toBe("formal");
  });
});
