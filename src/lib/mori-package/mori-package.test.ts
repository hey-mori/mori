import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  createMoriPackageFromSession,
  deserializeMoriPackage,
  serializeEventsJsonl,
  serializeMoriPackage,
  validateMoriPackage,
} from "./index";

describe(".mori package v0", () => {
  it("creates a valid package from a Mori session", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const validation = validateMoriPackage(pkg);

    expect(validation.valid).toBe(true);
    expect(pkg.manifest.formatVersion).toBe("0.1.0");
    expect(pkg.sessions[0]?.id).toBe(moriMockSession.session.id);
  });

  it("round-trips through JSON serialization", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const serialized = serializeMoriPackage(pkg);
    const deserialized = deserializeMoriPackage(serialized);

    expect(deserialized.manifest.packageId).toBe(pkg.manifest.packageId);
    expect(deserialized.events.length).toBe(pkg.events.length);
  });

  it("can expose events as JSONL for the future zip-like package", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const jsonl = serializeEventsJsonl(pkg);

    expect(jsonl.split("\n").length).toBe(pkg.events.length);
    expect(jsonl).toContain("evt-positioning");
  });
});
