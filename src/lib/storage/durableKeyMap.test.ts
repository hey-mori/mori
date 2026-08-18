import { describe, expect, it } from "vitest";
import {
  DURABLE_PREFIXES,
  DURABLE_SINGLETONS,
  documentToDurableKey,
  durableKeyToDocument,
  durableKinds,
} from "./durableKeyMap";

describe("durable key map", () => {
  // The guard the whole flip rests on. If the two directions ever disagreed
  // about a prefix, R6 would serve a store missing whatever the disagreement
  // covered, and it would look like data loss rather than a mapping bug.
  it("round-trips every per-owner kind", () => {
    for (const { prefix, kind } of DURABLE_PREFIXES) {
      const key = `${prefix}owner-1`;
      expect(durableKeyToDocument(key)).toEqual({ kind, ownerId: "owner-1" });
      expect(documentToDurableKey(kind, "owner-1")).toBe(key);
    }
  });

  it("round-trips every app-scoped kind", () => {
    for (const { key, kind } of DURABLE_SINGLETONS) {
      expect(durableKeyToDocument(key)).toEqual({ kind, ownerId: "@app" });
      expect(documentToDurableKey(kind, "@app")).toBe(key);
    }
  });

  it("covers every kind in both directions", () => {
    for (const kind of durableKinds()) {
      expect(documentToDurableKey(kind, "x")).not.toBeNull();
    }
  });

  it("does not confuse analysis with analysis history", () => {
    // The character after "mori.sessionAnalysis" is "." in one and "H" in the
    // other, so neither prefix contains the other. Quiet and load-bearing.
    expect(durableKeyToDocument("mori.sessionAnalysisHistory.s")?.kind).toBe("analysis_history");
    expect(durableKeyToDocument("mori.sessionAnalysis.s")?.kind).toBe("analysis");
  });

  it("holds no prefix that contains another", () => {
    for (const a of DURABLE_PREFIXES) {
      for (const b of DURABLE_PREFIXES) {
        if (a.prefix === b.prefix) continue;
        expect(b.prefix.startsWith(a.prefix)).toBe(false);
      }
    }
  });

  it("ignores keys that are not durable classes", () => {
    for (const key of [
      "mori.currentSessionDraft",
      "mori.themePreference",
      "mori.liveIntake.session.abc",
      "mori.sessionImports.s",
    ]) {
      expect(durableKeyToDocument(key)).toBeNull();
    }
  });
});
