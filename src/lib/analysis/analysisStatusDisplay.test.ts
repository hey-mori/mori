import { describe, expect, it } from "vitest";
import type { MoriAnalysisStatus } from "./analysisTypes";
import {
  describeAnalysisStatus,
  getAnalysisStatusTone,
} from "./analysisStatusDisplay";

const ALL_STATUSES: MoriAnalysisStatus[] = [
  "idle",
  "running",
  "succeeded",
  "failed",
];

describe("getAnalysisStatusTone", () => {
  it("maps each analysis status to its badge tone", () => {
    expect(getAnalysisStatusTone("idle")).toBe("gray");
    expect(getAnalysisStatusTone("running")).toBe("orange");
    expect(getAnalysisStatusTone("succeeded")).toBe("green");
    expect(getAnalysisStatusTone("failed")).toBe("red");
  });

  it("only ever surfaces the success tone for a succeeded run", () => {
    for (const status of ALL_STATUSES) {
      if (status !== "succeeded") {
        expect(getAnalysisStatusTone(status)).not.toBe("green");
      }
    }
  });
});

describe("describeAnalysisStatus", () => {
  it("returns a Korean label for every analysis status", () => {
    expect(describeAnalysisStatus("idle")).toBe("대기 중");
    expect(describeAnalysisStatus("running")).toBe("실행 중");
    expect(describeAnalysisStatus("succeeded")).toBe("완료");
    expect(describeAnalysisStatus("failed")).toBe("실패");
  });

  it("never returns an empty label", () => {
    for (const status of ALL_STATUSES) {
      expect(describeAnalysisStatus(status).length).toBeGreaterThan(0);
    }
  });
});
