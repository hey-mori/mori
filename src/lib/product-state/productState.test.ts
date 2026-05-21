import { describe, expect, it } from "vitest";
import {
  PRODUCT_AVAILABILITY_LABELS,
  PRODUCT_COMPANION_STATE_LABELS,
  PRODUCT_DATA_LABELS,
  PRODUCT_MEMORY_STATUS_LABELS,
  PRODUCT_RUNTIME_LABELS,
  getProductAvailabilityDisplay,
  getProductAvailabilityLabel,
  getProductAvailabilityTone,
  getProductCompanionStateDisplay,
  getProductCompanionStateLabel,
  getProductCompanionStateTone,
  getProductDataDisplay,
  getProductDataLabel,
  getProductMemoryStatusDisplay,
  getProductMemoryStatusLabel,
  getProductMemoryStatusTone,
  getProductRuntimeDisplay,
  getProductRuntimeLabel,
  productAvailabilityFromFeatureStatus,
  productAvailabilityFromIntegrationStatus,
  type ProductAvailabilityState,
  type ProductCompanionState,
  type ProductMemoryStatusState,
} from "./productState";
import type { FeatureStatus } from "../../app/featureStatus";
import type { IntegrationStatus } from "../sources/sourceRegistry";

const HANGUL = /[가-힣]/;

describe("availability label derivation", () => {
  it("exposes the canonical Korean status labels", () => {
    expect(getProductAvailabilityLabel("available")).toBe("사용 가능");
    expect(getProductAvailabilityLabel("partial")).toBe("부분 구현");
    expect(getProductAvailabilityLabel("planned")).toBe("예정");
    expect(getProductAvailabilityLabel("unavailable")).toBe("사용 불가");
    expect(getProductAvailabilityLabel("requiresSetup")).toBe("설정 필요");
    expect(getProductAvailabilityLabel("demoOnly")).toBe("데모 전용");
    expect(getProductAvailabilityLabel("browserOnly")).toBe("브라우저 전용");
    expect(getProductAvailabilityLabel("desktopOnly")).toBe("데스크톱 전용");
  });

  it("every availability state carries a Korean description", () => {
    for (const state of Object.keys(
      PRODUCT_AVAILABILITY_LABELS,
    ) as ProductAvailabilityState[]) {
      expect(HANGUL.test(getProductAvailabilityDisplay(state).description)).toBe(
        true,
      );
    }
  });
});

describe("availability tone derivation", () => {
  it("maps available to the success tone and partial to info", () => {
    expect(getProductAvailabilityTone("available")).toBe("success");
    expect(getProductAvailabilityTone("partial")).toBe("info");
  });

  it("never maps a not-ready state to the available (success) tone", () => {
    for (const state of [
      "planned",
      "unavailable",
      "requiresSetup",
    ] as ProductAvailabilityState[]) {
      expect(getProductAvailabilityTone(state)).not.toBe("success");
    }
  });

  it("uses the warning tone for planned and requiresSetup", () => {
    expect(getProductAvailabilityTone("planned")).toBe("warning");
    expect(getProductAvailabilityTone("requiresSetup")).toBe("warning");
  });
});

describe("runtime / storage label derivation", () => {
  it("derives runtime labels and tones", () => {
    expect(getProductRuntimeLabel("browserLocalStorage")).toBe(
      "브라우저 localStorage",
    );
    expect(getProductRuntimeLabel("desktopSQLite")).toBe("데스크톱 SQLite");
    expect(getProductRuntimeDisplay("desktopSQLite").tone).toBe("success");
    expect(getProductRuntimeDisplay("fallbackActive").tone).toBe("warning");
    expect(getProductRuntimeDisplay("localOnly").tone).toBe("neutral");
  });

  it("every runtime state carries a Korean description", () => {
    for (const display of Object.values(PRODUCT_RUNTIME_LABELS)) {
      expect(HANGUL.test(display.description)).toBe(true);
    }
  });
});

describe("data / provenance label derivation", () => {
  it("keeps the canonical trust terms and tones", () => {
    expect(getProductDataLabel("verified")).toBe("Verified");
    expect(getProductDataLabel("observed")).toBe("Observed");
    expect(getProductDataLabel("inferred")).toBe("Inferred");
    expect(getProductDataDisplay("verified").tone).toBe("verified");
    expect(getProductDataDisplay("observed").tone).toBe("observed");
    expect(getProductDataDisplay("inferred").tone).toBe("inferred");
  });

  it("uses Korean labels for the raw-data retention states", () => {
    expect(getProductDataLabel("summaryOnly")).toBe("요약만 보관");
    expect(getProductDataLabel("fullTextRetained")).toBe("원본 전체 보관");
    expect(HANGUL.test(getProductDataLabel("imported"))).toBe(true);
    expect(HANGUL.test(getProductDataLabel("userProvided"))).toBe(true);
  });

  it("every data state carries a Korean description", () => {
    for (const display of Object.values(PRODUCT_DATA_LABELS)) {
      expect(HANGUL.test(display.description)).toBe(true);
    }
  });
});

describe("memory lifecycle label derivation", () => {
  it("derives Korean labels for every accepted-memory status", () => {
    expect(getProductMemoryStatusLabel("accepted")).toBe("수락");
    expect(getProductMemoryStatusLabel("edited")).toBe("편집");
    expect(getProductMemoryStatusLabel("watching")).toBe("관찰");
    expect(getProductMemoryStatusLabel("deferred")).toBe("연기");
    expect(getProductMemoryStatusLabel("stale")).toBe("오래됨");
    expect(getProductMemoryStatusLabel("contradicted")).toBe("상충");
    expect(getProductMemoryStatusLabel("superseded")).toBe("대체됨");
    expect(getProductMemoryStatusLabel("retired")).toBe("은퇴");
  });

  it("maps current statuses to success and archived statuses to neutral", () => {
    expect(getProductMemoryStatusTone("accepted")).toBe("success");
    expect(getProductMemoryStatusTone("edited")).toBe("success");
    expect(getProductMemoryStatusTone("superseded")).toBe("neutral");
    expect(getProductMemoryStatusTone("retired")).toBe("neutral");
  });

  it("escalates a contradiction above a stale memory", () => {
    expect(getProductMemoryStatusTone("stale")).toBe("warning");
    expect(getProductMemoryStatusTone("contradicted")).toBe("danger");
  });

  it("never maps a not-current status to the success tone", () => {
    for (const state of [
      "watching",
      "deferred",
      "stale",
      "contradicted",
      "superseded",
      "retired",
    ] as ProductMemoryStatusState[]) {
      expect(getProductMemoryStatusTone(state)).not.toBe("success");
    }
  });

  it("every memory status carries a Korean description", () => {
    for (const state of Object.keys(
      PRODUCT_MEMORY_STATUS_LABELS,
    ) as ProductMemoryStatusState[]) {
      expect(HANGUL.test(getProductMemoryStatusDisplay(state).description)).toBe(
        true,
      );
      expect(HANGUL.test(getProductMemoryStatusLabel(state))).toBe(true);
    }
  });
});

describe("productAvailabilityFromFeatureStatus", () => {
  it("maps the FeatureStatus vocabulary one-to-one", () => {
    const cases: Array<[FeatureStatus, ProductAvailabilityState]> = [
      ["implemented", "available"],
      ["partial", "partial"],
      ["planned", "planned"],
      ["unavailable", "unavailable"],
    ];
    for (const [status, expected] of cases) {
      expect(productAvailabilityFromFeatureStatus(status)).toBe(expected);
    }
  });

  it("keeps planned / unavailable feature status off the available tone", () => {
    for (const status of ["planned", "unavailable"] as FeatureStatus[]) {
      const tone = getProductAvailabilityTone(
        productAvailabilityFromFeatureStatus(status),
      );
      expect(tone).not.toBe("success");
    }
  });
});

describe("productAvailabilityFromIntegrationStatus", () => {
  it("maps the IntegrationStatus vocabulary, routing mockOnly to demoOnly", () => {
    const cases: Array<[IntegrationStatus, ProductAvailabilityState]> = [
      ["implemented", "available"],
      ["partial", "partial"],
      ["planned", "planned"],
      ["mockOnly", "demoOnly"],
      ["unavailable", "unavailable"],
    ];
    for (const [status, expected] of cases) {
      expect(productAvailabilityFromIntegrationStatus(status)).toBe(expected);
    }
  });

  it("never maps a planned integration to the available tone", () => {
    expect(
      getProductAvailabilityTone(
        productAvailabilityFromIntegrationStatus("planned"),
      ),
    ).not.toBe("success");
  });
});

describe("companion state label derivation", () => {
  it("derives Korean labels for every companion state", () => {
    expect(getProductCompanionStateLabel("info")).toBe("정보");
    expect(getProductCompanionStateLabel("suggestion")).toBe("제안");
    expect(getProductCompanionStateLabel("review")).toBe("검토 필요");
    expect(getProductCompanionStateLabel("risk")).toBe("주의");
    expect(getProductCompanionStateLabel("needsReview")).toBe("검토 대기");
    expect(getProductCompanionStateLabel("readyToReport")).toBe("보고 준비");
    expect(getProductCompanionStateLabel("readyToResume")).toBe("이어가기 준비");
  });

  it("every companion state carries a Korean label and description", () => {
    for (const state of Object.keys(
      PRODUCT_COMPANION_STATE_LABELS,
    ) as ProductCompanionState[]) {
      expect(HANGUL.test(getProductCompanionStateLabel(state))).toBe(true);
      expect(
        HANGUL.test(getProductCompanionStateDisplay(state).description),
      ).toBe(true);
    }
  });
});

describe("companion state tone derivation", () => {
  it("maps risk to danger and readyToReport to success", () => {
    expect(getProductCompanionStateTone("risk")).toBe("danger");
    expect(getProductCompanionStateTone("readyToReport")).toBe("success");
  });

  it("never maps a review-required state to the available (success) tone", () => {
    for (const state of [
      "review",
      "needsReview",
      "risk",
    ] as ProductCompanionState[]) {
      expect(getProductCompanionStateTone(state)).not.toBe("success");
    }
  });

  it("keeps the calm informational tiers off the success tone", () => {
    expect(getProductCompanionStateTone("info")).toBe("neutral");
    expect(getProductCompanionStateTone("suggestion")).toBe("info");
  });
});

describe("memory lifecycle vs trust provenance separation", () => {
  it("keeps the accepted lifecycle distinct from verified trust", () => {
    // Both are positive, but they answer different questions — a saved
    // memory's lifecycle state vs. how an item's evidence is grounded.
    expect(getProductMemoryStatusLabel("accepted")).not.toBe(
      getProductDataLabel("verified"),
    );
    expect(getProductMemoryStatusLabel("accepted")).toBe("수락");
    expect(getProductDataLabel("verified")).toBe("Verified");
  });

  it("keeps companion suggestion state distinct from trust provenance", () => {
    // A companion signal explains *why Mori is surfacing something*; trust
    // explains *how grounded an item is*. They never share a label.
    const companionLabels = Object.values(PRODUCT_COMPANION_STATE_LABELS).map(
      (display) => display.label,
    );
    for (const trust of ["verified", "observed", "inferred"] as const) {
      expect(companionLabels).not.toContain(getProductDataLabel(trust));
    }
    // A review-needed companion state must not borrow the verified tone.
    expect(getProductCompanionStateTone("review")).not.toBe(
      getProductDataDisplay("verified").tone,
    );
  });
});
