import { describe, expect, it } from "vitest";
import { buildImportApplyCompletion } from "./importApplyCompletion";

describe("buildImportApplyCompletion", () => {
  it("routes freshly applied imports to Timeline, Quick Pass, and Project Memory", () => {
    const viewModel = buildImportApplyCompletion({
      appliedCount: 3,
      hasAnalysis: false,
    });

    expect(viewModel.headline).toBe("타임라인 이벤트 3건이 반영되었습니다.");
    expect(viewModel.actions.map((action) => action.id)).toEqual([
      "timeline",
      "quickPass",
      "memory",
    ]);
    expect(viewModel.actions[0]).toMatchObject({ primary: true });
  });

  it("does not offer Quick Pass when analysis is already present", () => {
    const viewModel = buildImportApplyCompletion({
      appliedCount: 1,
      hasAnalysis: true,
    });

    expect(viewModel.headline).toBe("타임라인 이벤트 1건이 반영되었습니다.");
    expect(viewModel.actions.map((action) => action.id)).toEqual(["timeline", "memory"]);
  });
});
