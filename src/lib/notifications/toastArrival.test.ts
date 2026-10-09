import { describe, expect, it } from "vitest";
import type { CompanionNotification } from "./notification";
import { toastArrival } from "./toastArrival";

const START = Date.parse("2026-10-09T12:00:00Z");
const item = (id: string, kind: CompanionNotification["kind"], createdAt: string): CompanionNotification =>
  ({ id, kind, severity: "info", title: id, message: "", basis: "verified", createdAt }) as CompanionNotification;

describe("which notification gets a toast", () => {
  it("toasts an import written during this run", () => {
    const fresh = item("import-finished:a", "import_finished", "2026-10-09T12:05:00Z");
    expect(toastArrival([fresh], new Set(), START)).toBe(fresh);
  });

  it("stays quiet when a view re-derives an import from before this run", () => {
    const old = item("import-finished:b", "import_finished", "2026-10-09T09:00:00Z");
    expect(toastArrival([old], new Set(), START)).toBeNull();
  });

  it("never toasts an id it already saw", () => {
    const fresh = item("import-finished:a", "import_finished", "2026-10-09T12:05:00Z");
    expect(toastArrival([fresh], new Set(["import-finished:a"]), START)).toBeNull();
  });

  it("leaves other kinds to the id check alone", () => {
    const other = item("sync:1", "import_sync" as CompanionNotification["kind"], "2026-10-01T00:00:00Z");
    expect(toastArrival([other], new Set(), START)).toBe(other);
  });
});
