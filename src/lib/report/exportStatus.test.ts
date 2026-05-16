import { describe, expect, it } from "vitest";
import {
  exportPhaseRole,
  exportPhaseTone,
  exportRunningLabel,
  phaseForWriteResult,
  type MoriExportPhase,
} from "./exportStatus";

describe("exportPhaseTone", () => {
  it("maps each phase to a shared status tone", () => {
    expect(exportPhaseTone("idle")).toBe("idle");
    expect(exportPhaseTone("running")).toBe("info");
    expect(exportPhaseTone("success")).toBe("ok");
    expect(exportPhaseTone("error")).toBe("error");
    expect(exportPhaseTone("cancelled")).toBe("idle");
  });
});

describe("exportPhaseRole", () => {
  it("announces only errors assertively", () => {
    expect(exportPhaseRole("error")).toBe("alert");
    for (const phase of ["idle", "running", "success", "cancelled"] as MoriExportPhase[]) {
      expect(exportPhaseRole(phase)).toBe("status");
    }
  });
});

describe("phaseForWriteResult", () => {
  it("settles a saved write on success", () => {
    expect(phaseForWriteResult({ status: "saved", message: "ok" })).toBe("success");
  });

  it("settles a cancelled write on cancelled", () => {
    expect(phaseForWriteResult({ status: "cancelled", message: "x" })).toBe("cancelled");
  });

  it("settles a failed write on error", () => {
    expect(phaseForWriteResult({ status: "error", message: "x" })).toBe("error");
  });
});

describe("exportRunningLabel", () => {
  it("distinguishes the two export actions", () => {
    expect(exportRunningLabel("full")).not.toBe(exportRunningLabel("clientSafe"));
    expect(exportRunningLabel("clientSafe")).toContain("클라이언트");
  });
});
