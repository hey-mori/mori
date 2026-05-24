import { describe, expect, it } from "vitest";
import {
  getConnectorFeatureId,
  getPlannedConnectorRows,
  getPrivacyGuarantees,
  getPrivacyPolicy,
  getProviderRows,
  getRecommendedSetupStep,
  getStorageStatusRows,
  groupPrivacyPolicyByState,
  summarizeRepositories,
} from "./settingsStatus";
import { DEFAULT_QUICK_PASS_SETTINGS, type QuickPassAnalysisSettings } from "../analysis";

function settings(overrides: Partial<QuickPassAnalysisSettings> = {}): QuickPassAnalysisSettings {
  return { ...DEFAULT_QUICK_PASS_SETTINGS, ...overrides };
}

describe("getProviderRows", () => {
  it("marks the currently-selected provider as selected and exposes 6 rows", () => {
    const rows = getProviderRows(settings({ provider: "ollama" }));
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.id === "ollama")?.selected).toBe(true);
    expect(rows.find((row) => row.id === "deterministic")?.selected).toBe(false);
  });

  it("returns implemented status for deterministic + ollama, planned for the rest", () => {
    const rows = getProviderRows(settings());
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId.deterministic.status).toBe("implemented");
    expect(byId.ollama.status).toBe("implemented");
    expect(byId.lmStudio.status).toBe("planned");
    expect(byId.openAiCompatible.status).toBe("planned");
    expect(byId.toolNativeApi.status).toBe("planned");
    expect(byId.cloudApi.status).toBe("planned");
  });

  it("only the Ollama row exposes canTest=true today", () => {
    const rows = getProviderRows(settings());
    expect(rows.find((row) => row.id === "ollama")?.canTest).toBe(true);
    for (const row of rows.filter((row) => row.id !== "ollama")) {
      expect(row.canTest).toBe(false);
    }
  });
});

describe("getPrivacyPolicy", () => {
  it("returns enforced / default / planned policies with the right states", () => {
    const policy = getPrivacyPolicy();
    const states = new Set(policy.map((row) => row.state));
    expect(states.has("enforced")).toBe(true);
    expect(states.has("default")).toBe(true);
    expect(states.has("planned")).toBe(true);
  });

  it("includes the four enforced posture guarantees", () => {
    const ids = getPrivacyPolicy().map((row) => row.id);
    expect(ids).toContain("no-background-capture");
    expect(ids).toContain("no-browser-scan");
    expect(ids).toContain("no-fs-scan");
    expect(ids).toContain("no-oauth");
  });
});

describe("groupPrivacyPolicyByState", () => {
  it("partitions every policy row into its state group", () => {
    const groups = groupPrivacyPolicyByState();
    const total =
      groups.enforced.length + groups.default.length + groups.planned.length;
    expect(total).toBe(getPrivacyPolicy().length);
    expect(groups.enforced.every((row) => row.state === "enforced")).toBe(true);
    expect(groups.default.every((row) => row.state === "default")).toBe(true);
    expect(groups.planned.every((row) => row.state === "planned")).toBe(true);
  });

  it("keeps the four architecture guarantees in the enforced group", () => {
    const enforced = groupPrivacyPolicyByState().enforced.map((row) => row.id);
    expect(enforced).toContain("no-background-capture");
    expect(enforced).toContain("no-oauth");
  });
});

describe("getPrivacyGuarantees", () => {
  it("lists the hard non-goals as non-empty Korean lines", () => {
    const guarantees = getPrivacyGuarantees();
    expect(guarantees.length).toBeGreaterThan(0);
    const hangul = /[가-힣]/;
    for (const line of guarantees) {
      expect(line.length).toBeGreaterThan(0);
      expect(hangul.test(line)).toBe(true);
    }
  });
});

describe("getStorageStatusRows", () => {
  it("marks SQLite unavailable when running in the browser regardless of session count", () => {
    const rows = getStorageStatusRows({
      mode: "browser",
      sqliteAvailable: false,
      sqliteKind: "unavailable",
      sqliteSessionCount: 0,
      packageDraftCount: 0,
    });
    const sqlite = rows.find((row) => row.id === "desktop-sqlite");
    expect(sqlite?.state).toBe("unavailable");
    expect(sqlite?.hint).toMatch(/브라우저 prototype/);
  });

  it("marks SQLite active when desktop runtime has applied migrations", () => {
    const rows = getStorageStatusRows({
      mode: "tauri-desktop",
      sqliteAvailable: true,
      sqliteKind: "ok",
      sqliteSessionCount: 3,
      packageDraftCount: 1,
    });
    const sqlite = rows.find((row) => row.id === "desktop-sqlite");
    expect(sqlite?.state).toBe("active");
    expect(sqlite?.hint).toContain("3건");
  });

  it("flags zip .mori as planned regardless of runtime", () => {
    const rows = getStorageStatusRows({
      mode: "tauri-desktop",
      sqliteAvailable: true,
      sqliteKind: "ok",
      sqliteSessionCount: 0,
      packageDraftCount: 0,
    });
    const zip = rows.find((row) => row.id === "zip-mori");
    expect(zip?.state).toBe("planned");
  });
});

describe("getPlannedConnectorRows", () => {
  it("returns only planned integrations from the registry", () => {
    const rows = getPlannedConnectorRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.integration.status).toBe("planned");
    }
  });

  it("each connector row carries non-empty willNotAccess guarantees", () => {
    for (const row of getPlannedConnectorRows()) {
      expect(row.willNotAccess.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("summarizeRepositories", () => {
  it("buckets repos by verification status and treats >24h as stale", () => {
    const now = Date.now();
    const dayAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    const summary = summarizeRepositories([
      { id: "a", isDefault: true, verification: { status: "verified", verifiedAt: fresh } },
      { id: "b", verification: { status: "verified", verifiedAt: dayAgo } },
      { id: "c", verification: { status: "failed" } },
      { id: "d" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.verified).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.unverified).toBe(1);
    expect(summary.default).toBe("a");
  });

  it("returns zero counts when no repos are passed", () => {
    expect(summarizeRepositories([])).toEqual({
      total: 0,
      verified: 0,
      stale: 0,
      failed: 0,
      unverified: 0,
      default: null,
    });
  });
});

describe("getRecommendedSetupStep", () => {
  it("recommends importing a source when nothing has been brought in", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 0,
        hasAnalysis: false,
        repositoriesTotal: 0,
        mode: "browser",
        sqliteKind: "unavailable",
        hasUnsavedDraft: false,
        providerKind: "deterministic",
      }).id,
    ).toBe("import-source");
  });

  it("recommends Quick Pass once imports exist but no analysis ran", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 2,
        hasAnalysis: false,
        repositoriesTotal: 0,
        mode: "browser",
        sqliteKind: "unavailable",
        hasUnsavedDraft: false,
        providerKind: "deterministic",
      }).id,
    ).toBe("run-quickpass");
  });

  it("recommends saving to SQLite when desktop runtime is ready and draft is unsaved", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 2,
        hasAnalysis: true,
        repositoriesTotal: 0,
        mode: "tauri-desktop",
        sqliteKind: "ok",
        hasUnsavedDraft: true,
        providerKind: "deterministic",
      }).id,
    ).toBe("save-to-sqlite");
  });

  it("recommends a repository when none are configured (after import + analysis + storage)", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 2,
        hasAnalysis: true,
        repositoriesTotal: 0,
        mode: "tauri-desktop",
        sqliteKind: "ok",
        hasUnsavedDraft: false,
        providerKind: "deterministic",
      }).id,
    ).toBe("verify-repository");
  });

  it("recommends configuring Ollama when only deterministic provider is used", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 2,
        hasAnalysis: true,
        repositoriesTotal: 1,
        mode: "tauri-desktop",
        sqliteKind: "ok",
        hasUnsavedDraft: false,
        providerKind: "deterministic",
      }).id,
    ).toBe("configure-ollama");
  });

  it("returns all-good once every previous step is satisfied", () => {
    expect(
      getRecommendedSetupStep({
        importsCount: 2,
        hasAnalysis: true,
        repositoriesTotal: 1,
        mode: "tauri-desktop",
        sqliteKind: "ok",
        hasUnsavedDraft: false,
        providerKind: "ollama",
      }).id,
    ).toBe("all-good");
  });
});

describe("getConnectorFeatureId", () => {
  it("maps integrations that have a feature row to their canonical id", () => {
    expect(getConnectorFeatureId("terminal")).toBe(
      "connector.terminalShellIntegration",
    );
    expect(getConnectorFeatureId("browserTab")).toBe(
      "connector.browserExtension",
    );
    expect(getConnectorFeatureId("codexTranscript")).toBe(
      "connector.codexDesktopImport",
    );
  });

  it("returns null for integrations with no feature counterpart", () => {
    expect(getConnectorFeatureId("slack")).toBeNull();
    expect(getConnectorFeatureId("notion")).toBeNull();
    expect(getConnectorFeatureId("figma")).toBeNull();
  });

  it("returns null for an unknown integration id", () => {
    expect(getConnectorFeatureId("not-a-connector")).toBeNull();
  });

  it("only maps to connector feature ids that exist in the planned rows set", () => {
    for (const { integration } of getPlannedConnectorRows()) {
      const featureId = getConnectorFeatureId(integration.id);
      if (featureId !== null) {
        expect(featureId.startsWith("connector.")).toBe(true);
      }
    }
  });
});
