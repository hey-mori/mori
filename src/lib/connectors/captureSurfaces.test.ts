import { describe, expect, it } from "vitest";
import {
  describeCaptureSurfaceStatus,
  getAllCaptureSurfaces,
  getCaptureSurfaceForIntegration,
  getCaptureSurfacesByFamily,
  getCaptureSurfacesByStatus,
  getImplementedCaptureSurfaces,
  getNextConnectorMilestone,
  getPlannedCaptureSurfaces,
  type CaptureSurfaceRow,
} from "./captureSurfaces";

describe("getAllCaptureSurfaces", () => {
  it("includes every documented surface id exactly once", () => {
    const ids = getAllCaptureSurfaces().map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Spot-check that every major family is present.
    expect(ids).toEqual(
      expect.arrayContaining([
        "manualNote",
        "urlImport",
        "aiTranscriptPaste",
        "gitDiffPaste",
        "tauriGitDiff",
        "repositoryMetadata",
        "quickPass",
        "localCaptureBridge",
        "claudeCodeHook",
        "claudeDesktopExport",
        "claudeWebExport",
        "codexCliWrapper",
        "codexDesktopExport",
        "codexWebGithub",
        "vscodeExtension",
        "cursorExtension",
        "terminalShellIntegration",
        "browserExtension",
        "githubPrImport",
        "fileDocumentImport",
        "mcpServer",
      ]),
    );
  });
});

describe("matrix consistency invariants", () => {
  it("planned surfaces can never claim canEnterImportReview", () => {
    for (const row of getAllCaptureSurfaces()) {
      if (row.status === "planned") {
        expect(row.canEnterImportReview).toBe(false);
        expect(row.canCreateSource).toBe(false);
        expect(row.canCreateEvents).toBe(false);
      }
    }
  });

  it("docsTemplateOnly surfaces describe a missing UI as the next step", () => {
    for (const row of getCaptureSurfacesByStatus("docsTemplateOnly")) {
      expect(row.nextStep).toMatch(/UI|tab|Hub|Import/);
    }
  });

  it("every implemented import surface is allowed to create sources", () => {
    for (const row of getAllCaptureSurfaces()) {
      if (
        row.status === "implemented" &&
        row.captureMode !== "manualAnalysis" &&
        row.captureMode !== "localDesktopCommand" // repo metadata is a metadata-only flow
      ) {
        expect(row.canCreateSource).toBe(true);
      }
    }
  });

  it("every privacy boundary is non-empty and every surface lists at least one neverAccess line", () => {
    for (const row of getAllCaptureSurfaces()) {
      expect(row.privacyBoundary.length).toBeGreaterThan(8);
      expect(row.whatMoriNeverAccesses.length).toBeGreaterThan(0);
    }
  });

  it("planned surfaces wear summaryOnly / notCaptured / referenceOnly raw data policies (no retained)", () => {
    for (const row of getAllCaptureSurfaces()) {
      if (row.status === "planned") {
        expect(["summaryOnly", "notCaptured", "referenceOnly"]).toContain(row.rawDataPolicy);
      }
    }
  });

  it("lists the shipped local-capture bridge as a real capture surface", () => {
    const row = getAllCaptureSurfaces().find((entry) => entry.id === "localCaptureBridge");
    expect(row).toBeDefined();
    // The bridge is a shipped template the user runs explicitly — it
    // produces connector JSONL that can enter Import Review.
    expect(row?.status).toBe("docsTemplateOnly");
    expect(row?.captureMode).toBe("localCliWrapper");
    expect(row?.canEnterImportReview).toBe(true);
    expect(row?.rawDataPolicy).toBe("summaryOnly");
  });
});

describe("getCaptureSurfacesByFamily", () => {
  it("groups Claude family entries", () => {
    const claudeIds = getCaptureSurfacesByFamily("claude").map((row) => row.id);
    expect(claudeIds).toEqual(
      expect.arrayContaining([
        "aiTranscriptPaste",
        "claudeCodeHook",
        "claudeDesktopExport",
        "claudeWebExport",
        "mcpServer",
      ]),
    );
  });

  it("groups Codex family entries", () => {
    const codexIds = getCaptureSurfacesByFamily("codex").map((row) => row.id);
    expect(codexIds).toEqual(
      expect.arrayContaining(["codexCliWrapper", "codexDesktopExport", "codexWebGithub"]),
    );
  });
});

describe("getCaptureSurfacesByStatus + getImplemented/PlannedCaptureSurfaces", () => {
  it("returns disjoint implemented + planned sets covering every surface", () => {
    const all = new Set(getAllCaptureSurfaces().map((row) => row.id));
    const implemented = new Set(getImplementedCaptureSurfaces().map((row) => row.id));
    const planned = new Set(getPlannedCaptureSurfaces().map((row) => row.id));
    for (const id of implemented) {
      expect(planned.has(id)).toBe(false);
    }
    // Every surface should land in one of the buckets.
    for (const id of all) {
      const inEither = implemented.has(id) || planned.has(id);
      expect(inEither).toBe(true);
    }
  });

  it("filters by individual status", () => {
    for (const status of [
      "implemented",
      "partial",
      "manualOnly",
      "docsTemplateOnly",
      "planned",
      "unavailable",
    ] as const) {
      for (const row of getCaptureSurfacesByStatus(status)) {
        expect(row.status).toBe(status);
      }
    }
  });
});

describe("getCaptureSurfaceForIntegration", () => {
  it("maps `claudeTranscript` to a Claude-family surface", () => {
    const row = getCaptureSurfaceForIntegration("claudeTranscript");
    expect(row).not.toBeNull();
    expect(row?.toolFamily).toBe("claude");
  });

  it("maps `gitDiff` to a git surface", () => {
    const row = getCaptureSurfaceForIntegration("gitDiff");
    expect(row?.toolFamily).toBe("git");
  });

  it("returns null for an unknown integration id", () => {
    expect(getCaptureSurfaceForIntegration("definitely-not-a-real-id")).toBeNull();
  });
});

describe("describeCaptureSurfaceStatus", () => {
  it("returns matching label / tone / short copy per status", () => {
    const sample = getAllCaptureSurfaces().slice(0, 5);
    for (const row of sample) {
      const description = describeCaptureSurfaceStatus(row);
      expect(description.label).toBeTruthy();
      expect(description.short.length).toBeGreaterThan(8);
      // Tone is a known palette key.
      expect(["green", "blue", "purple", "gray", "orange"]).toContain(description.tone);
    }
  });

  it("uses green tone for implemented, gray for planned", () => {
    const implemented = getAllCaptureSurfaces().find((row) => row.status === "implemented")!;
    const planned = getAllCaptureSurfaces().find((row) => row.status === "planned")!;
    expect(describeCaptureSurfaceStatus(implemented).tone).toBe("green");
    expect(describeCaptureSurfaceStatus(planned).tone).toBe("gray");
  });
});

describe("getNextConnectorMilestone", () => {
  it("picks a docs-template surface that can enter Import Review when available", () => {
    const milestone = getNextConnectorMilestone();
    const all = getAllCaptureSurfaces();
    const docsTemplate = all.find(
      (row: CaptureSurfaceRow) => row.status === "docsTemplateOnly" && row.canEnterImportReview,
    );
    if (docsTemplate) {
      expect(milestone.surfaceId).toBe(docsTemplate.id);
      expect(milestone.reason).toBe("missing-ui");
    }
  });
});
