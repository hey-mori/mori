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

  it("stays quiet when opening a session re-derives an import from before this run", () => {
    const old = item("import-finished:b", "import_finished", "2026-10-09T09:00:00Z");
    expect(toastArrival([old], new Set(), START)).toBeNull();
  });

  it("toasts the auto-import pass summary stamped during this run", () => {
    const pass = item("sessions-imported:2026-10-09T12:03:00Z", "import_finished", "2026-10-09T12:03:00Z");
    expect(toastArrival([pass], new Set(), START)).toBe(pass);
  });

  it("stays quiet for a feed row of a session that started long ago", () => {
    const feed = item("feed:s1:captured", "import_finished", "2026-09-01T00:00:00Z");
    expect(toastArrival([feed], new Set(), START)).toBeNull();
  });

  it("never toasts an id it already knows", () => {
    const fresh = item("import-finished:a", "import_finished", "2026-10-09T12:05:00Z");
    expect(toastArrival([fresh], new Set(["import-finished:a"]), START)).toBeNull();
  });

  it("leaves other kinds to the id check alone, whatever their date", () => {
    const detection = item("background-detection:/x", "background_detection", "2026-10-01T00:00:00Z");
    expect(toastArrival([detection], new Set(), START)).toBe(detection);
  });
});
