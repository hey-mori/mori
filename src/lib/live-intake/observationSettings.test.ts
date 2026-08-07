import { describe, expect, it } from "vitest";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import {
  loadObservationSettings,
  OBSERVATION_KEY,
  saveObservationSettings,
} from "./observationSettings";

describe("observation settings", () => {
  it("is off until the user turns it on", () => {
    // Ambient observation changes when Mori reads the user's agent files, so it
    // must arrive off and be chosen, never default on with an update.
    expect(loadObservationSettings(new MemoryKeyValueStorage()).ambient).toBe(false);
  });

  it("round-trips the opt-in", () => {
    const storage = new MemoryKeyValueStorage();
    saveObservationSettings({ ambient: true }, storage);

    expect(loadObservationSettings(storage).ambient).toBe(true);
  });

  it("reads a malformed value as off rather than throwing", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(OBSERVATION_KEY, "{ not json");

    expect(loadObservationSettings(storage).ambient).toBe(false);
  });

  it("treats a non-boolean as off, never as truthy", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(OBSERVATION_KEY, JSON.stringify({ ambient: "yes" }));

    expect(loadObservationSettings(storage).ambient).toBe(false);
  });

  it("is off with no storage at all", () => {
    expect(loadObservationSettings(null).ambient).toBe(false);
  });
});
