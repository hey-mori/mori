import { describe, expect, it } from "vitest";
import { getAllCaptureSurfaces } from "./captureSurfaces";
import {
  buildConnectorControlCenter,
  describeControlCenterAvailability,
  partitionControlCenterSurfaces,
  type BuildControlCenterInput,
  type ControlCenterSurface,
} from "./connectorControlCenter";

const DESKTOP_WITH_SESSION: BuildControlCenterInput = {
  isDesktop: true,
  hasActiveSession: true,
};
const BROWSER_WITH_SESSION: BuildControlCenterInput = {
  isDesktop: false,
  hasActiveSession: true,
};
const BROWSER_NO_SESSION: BuildControlCenterInput = {
  isDesktop: false,
  hasActiveSession: false,
};

function allSurfaces(input: BuildControlCenterInput): ControlCenterSurface[] {
  return buildConnectorControlCenter(input).groups.flatMap((group) => group.surfaces);
}

function findSurface(input: BuildControlCenterInput, id: string): ControlCenterSurface {
  const surface = allSurfaces(input).find((entry) => entry.id === id);
  if (!surface) throw new Error(`missing surface ${id}`);
  return surface;
}

describe("buildConnectorControlCenter", () => {
  it("excludes the analysis family (Quick Pass is not a connectable source)", () => {
    const vm = buildConnectorControlCenter(DESKTOP_WITH_SESSION);
    expect(vm.groups.some((group) => group.family === "analysis")).toBe(false);
    expect(allSurfaces(DESKTOP_WITH_SESSION).some((s) => s.id === "quickPass")).toBe(false);
  });

  it("covers every non-analysis surface exactly once", () => {
    const expected = getAllCaptureSurfaces().filter((row) => row.toolFamily !== "analysis");
    const surfaces = allSurfaces(DESKTOP_WITH_SESSION);
    expect(surfaces.length).toBe(expected.length);
    expect(new Set(surfaces.map((s) => s.id)).size).toBe(surfaces.length);
  });

  it("counts sum to the total surface count", () => {
    const { counts } = buildConnectorControlCenter(DESKTOP_WITH_SESSION);
    const sum =
      counts.available +
      counts.needsDesktopApp +
      counts.needsSetup +
      counts.planned +
      counts.unavailable;
    expect(sum).toBe(counts.total);
    expect(counts.total).toBe(allSurfaces(DESKTOP_WITH_SESSION).length);
  });

  it("orders families with Claude first and excludes analysis", () => {
    const families = buildConnectorControlCenter(DESKTOP_WITH_SESSION).groups.map((g) => g.family);
    expect(families[0]).toBe("claude");
    expect(families).not.toContain("analysis");
  });

  it("tags AI-agent families as session anchors and the rest as evidence", () => {
    const groups = buildConnectorControlCenter(DESKTOP_WITH_SESSION).groups;
    const roleOf = (family: string) => groups.find((g) => g.family === family)?.role;
    for (const agent of ["claude", "codex", "opencode"]) {
      expect(roleOf(agent)).toBe("agent");
    }
    for (const evidence of ["git", "terminal", "manual", "document", "ide", "browser"]) {
      expect(roleOf(evidence)).toBe("evidence");
    }
  });

  it("marks the local hook / CLI wrapper surfaces as recommended", () => {
    for (const id of ["claudeCodeHook", "codexCliWrapper", "openCodeCli"]) {
      expect(findSurface(DESKTOP_WITH_SESSION, id).recommended).toBe(true);
    }
    // A plain paste surface is never the recommended capture path.
    expect(findSurface(DESKTOP_WITH_SESSION, "aiTranscriptPaste").recommended).toBe(false);
  });

  it("sorts surfaces inside a group available-first", () => {
    for (const group of buildConnectorControlCenter(BROWSER_WITH_SESSION).groups) {
      const ranks = group.surfaces.map((s) =>
        s.availability === "available"
          ? 0
          : s.availability === "needsSetup"
            ? 1
            : s.availability === "needsDesktopApp"
              ? 2
              : s.availability === "planned"
                ? 3
                : 4,
      );
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    }
  });
});

describe("availability classification", () => {
  it("marks pasted manual / url / git / ai surfaces available in the browser", () => {
    for (const id of ["manualNote", "urlImport", "gitDiffPaste", "aiTranscriptPaste"]) {
      expect(findSurface(BROWSER_WITH_SESSION, id).availability).toBe("available");
    }
  });

  it("downgrades desktop-only surfaces to needsDesktopApp in the browser", () => {
    expect(findSurface(BROWSER_WITH_SESSION, "tauriGitDiff").availability).toBe("needsDesktopApp");
    expect(findSurface(BROWSER_WITH_SESSION, "repositoryMetadata").availability).toBe(
      "needsDesktopApp",
    );
  });

  it("keeps desktop-only surfaces available in the desktop app", () => {
    expect(findSurface(DESKTOP_WITH_SESSION, "tauriGitDiff").availability).toBe("available");
    expect(findSurface(DESKTOP_WITH_SESSION, "repositoryMetadata").availability).toBe("available");
  });

  it("treats shipped local-capture templates as needsSetup", () => {
    for (const id of ["localCaptureBridge", "claudeCodeHook", "codexCliWrapper"]) {
      expect(findSurface(DESKTOP_WITH_SESSION, id).availability).toBe("needsSetup");
    }
  });

  it("keeps planned surfaces planned in every runtime", () => {
    expect(findSurface(DESKTOP_WITH_SESSION, "vscodeExtension").availability).toBe("planned");
    expect(findSurface(BROWSER_NO_SESSION, "browserExtension").availability).toBe("planned");
  });
});

describe("action honesty invariants", () => {
  it("never makes a planned or unavailable surface importable", () => {
    for (const surface of allSurfaces(DESKTOP_WITH_SESSION)) {
      if (surface.availability === "planned" || surface.availability === "unavailable") {
        expect(surface.action.kind).not.toBe("evidenceImport");
        expect(surface.action.enabled).toBe(false);
      }
    }
  });

  it("disables every evidence import when no session is active", () => {
    for (const surface of allSurfaces(BROWSER_NO_SESSION)) {
      if (surface.action.kind === "evidenceImport") {
        expect(surface.action.enabled).toBe(false);
        expect(surface.action.disabledReason).toBeTruthy();
      }
    }
  });

  it("enables paste imports once a session exists", () => {
    const note = findSurface(BROWSER_WITH_SESSION, "manualNote");
    expect(note.action.kind).toBe("evidenceImport");
    expect(note.action.enabled).toBe(true);
    expect(note.action.importKind).toBe("note");
  });

  it("routes needs-setup capture templates into the connector import tab", () => {
    const hook = findSurface(DESKTOP_WITH_SESSION, "claudeCodeHook");
    expect(hook.action.kind).toBe("evidenceImport");
    expect(hook.action.importKind).toBe("connector");
  });

  it("never enables an action on a needsDesktopApp surface", () => {
    for (const surface of allSurfaces(BROWSER_WITH_SESSION)) {
      if (surface.availability === "needsDesktopApp") {
        expect(surface.action.enabled).toBe(false);
      }
    }
  });

  it("points repository metadata at Settings → Repositories", () => {
    expect(findSurface(DESKTOP_WITH_SESSION, "repositoryMetadata").action.kind).toBe(
      "repositorySettings",
    );
  });

  it("carries an AI platform hint into the AI transcript tab", () => {
    const ai = findSurface(BROWSER_WITH_SESSION, "aiTranscriptPaste");
    expect(ai.action.importKind).toBe("ai");
  });
});

describe("privacy passthrough", () => {
  it("keeps a non-empty privacy boundary and at least one never-access line per surface", () => {
    for (const surface of allSurfaces(DESKTOP_WITH_SESSION)) {
      expect(surface.privacyBoundary.length).toBeGreaterThan(8);
      expect(surface.whatMoriNeverAccesses.length).toBeGreaterThan(0);
    }
  });
});

describe("partitionControlCenterSurfaces", () => {
  it("splits surfaces into actionable + planned with no overlap and full coverage", () => {
    const vm = buildConnectorControlCenter(BROWSER_WITH_SESSION);
    const { actionable, planned } = partitionControlCenterSurfaces(vm);
    const all = allSurfaces(BROWSER_WITH_SESSION);
    expect(actionable.length + planned.length).toBe(all.length);
    const ids = new Set([...actionable, ...planned].map((s) => s.id));
    expect(ids.size).toBe(all.length);
    // No planned surface leaks into the actionable list and vice versa.
    expect(actionable.every((s) => s.availability !== "planned")).toBe(true);
    expect(planned.every((s) => s.availability === "planned" || s.availability === "unavailable")).toBe(
      true,
    );
  });

  it("orders the actionable list available-first", () => {
    const vm = buildConnectorControlCenter(BROWSER_WITH_SESSION);
    const { actionable } = partitionControlCenterSurfaces(vm);
    const firstNonAvailable = actionable.findIndex((s) => s.availability !== "available");
    if (firstNonAvailable !== -1) {
      // Every surface after the first non-available one is also non-available.
      for (let i = firstNonAvailable; i < actionable.length; i += 1) {
        expect(actionable[i]!.availability).not.toBe("available");
      }
    }
    // In the browser the manual / paste sources are available and lead.
    expect(actionable[0]?.availability).toBe("available");
  });
});

describe("describeControlCenterAvailability", () => {
  it("maps availability to a label and a known tone", () => {
    const known = ["green", "blue", "purple", "gray", "orange"];
    for (const availability of [
      "available",
      "needsDesktopApp",
      "needsSetup",
      "planned",
      "unavailable",
    ] as const) {
      const described = describeControlCenterAvailability(availability);
      expect(described.label).toBeTruthy();
      expect(known).toContain(described.tone);
    }
  });
});
