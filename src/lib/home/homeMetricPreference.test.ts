import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_METRIC_PREFERENCE,
  isSelectableHomeMetric,
  loadHomeMetricPreference,
  parseHomeMetricPreference,
  saveHomeMetricPreference,
  serializeHomeMetricPreference,
} from "./homeMetricPreference";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";

describe("isSelectableHomeMetric", () => {
  it("accepts the three lenses and rejects everything else", () => {
    expect(isSelectableHomeMetric("sessions")).toBe(true);
    expect(isSelectableHomeMetric("activity")).toBe(true);
    expect(isSelectableHomeMetric("tokens")).toBe(true);
    expect(isSelectableHomeMetric("bogus")).toBe(false);
    expect(isSelectableHomeMetric(7)).toBe(false);
    expect(isSelectableHomeMetric(null)).toBe(false);
  });
});

describe("parseHomeMetricPreference", () => {
  it("returns the default for null / empty / malformed input", () => {
    expect(parseHomeMetricPreference(null)).toEqual(DEFAULT_HOME_METRIC_PREFERENCE);
    expect(parseHomeMetricPreference("")).toEqual(DEFAULT_HOME_METRIC_PREFERENCE);
    expect(parseHomeMetricPreference("{not json")).toEqual(DEFAULT_HOME_METRIC_PREFERENCE);
  });

  it("falls back on a schema-version mismatch or unknown metric", () => {
    expect(
      parseHomeMetricPreference(JSON.stringify({ schemaVersion: 99, metric: "tokens" })),
    ).toEqual(DEFAULT_HOME_METRIC_PREFERENCE);
    expect(
      parseHomeMetricPreference(JSON.stringify({ schemaVersion: 1, metric: "bogus" })),
    ).toEqual(DEFAULT_HOME_METRIC_PREFERENCE);
  });

  it("round-trips a valid preference", () => {
    const stored = serializeHomeMetricPreference({ schemaVersion: 1, metric: "tokens" });
    expect(parseHomeMetricPreference(stored).metric).toBe("tokens");
  });
});

describe("loadHomeMetricPreference / saveHomeMetricPreference", () => {
  it("defaults to sessions when nothing is stored", () => {
    expect(loadHomeMetricPreference(new MemoryKeyValueStorage())).toEqual(
      DEFAULT_HOME_METRIC_PREFERENCE,
    );
  });

  it("persists and reloads a chosen lens", () => {
    const storage = new MemoryKeyValueStorage();
    saveHomeMetricPreference("activity", storage);
    expect(loadHomeMetricPreference(storage).metric).toBe("activity");
  });

  it("recovers the default when storage holds an unknown lens", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.homeMetricPreference",
      JSON.stringify({ schemaVersion: 1, metric: "futureLens" }),
    );
    expect(loadHomeMetricPreference(storage).metric).toBe("sessions");
  });
});
