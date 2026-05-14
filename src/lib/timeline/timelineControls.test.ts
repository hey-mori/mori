import { describe, expect, it } from "vitest";
import {
  TIMELINE_CONTROLS,
  getPlannedHint,
  isImplemented,
  listImplemented,
  listPlanned,
} from "./timelineControls";

describe("Timeline control registry", () => {
  it("every entry's key matches its id", () => {
    for (const [key, value] of Object.entries(TIMELINE_CONTROLS)) {
      expect(value.id).toBe(key);
    }
  });

  it("every planned control includes a tooltip", () => {
    for (const id of listPlanned()) {
      expect(TIMELINE_CONTROLS[id].plannedHint).toBeTruthy();
    }
  });

  it("getPlannedHint returns undefined for implemented controls", () => {
    for (const id of listImplemented()) {
      expect(getPlannedHint(id)).toBeUndefined();
    }
  });

  it("does not classify density or filter as planned", () => {
    expect(isImplemented("density")).toBe(true);
    expect(isImplemented("filter")).toBe(true);
    expect(isImplemented("search")).toBe(true);
  });

  it("treats session-end and sidebar-collapse as planned", () => {
    expect(isImplemented("endSession")).toBe(false);
    expect(isImplemented("sidebarCollapse")).toBe(false);
  });
});
