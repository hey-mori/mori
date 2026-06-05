import { describe, expect, it } from "vitest";
import { buildImportApplyCompletion } from "./importApplyCompletion";

describe("buildImportApplyCompletion", () => {
  it("leads a freshly applied import with the analysis action, then timeline", () => {
    const viewModel = buildImportApplyCompletion({
      appliedCount: 3,
      hasAnalysis: false,
    });

    expect(viewModel.headline).toBe("타임라인 이벤트 3건이 반영되었습니다.");
    expect(viewModel.actions.map((action) => action.id)).toEqual([
      "quickPass",
      "timeline",
    ]);
    expect(viewModel.actions[0]).toMatchObject({ id: "quickPass", primary: true });
  });

  it("offers only the timeline when analysis is already present", () => {
    const viewModel = buildImportApplyCompletion({
      appliedCount: 1,
      hasAnalysis: true,
    });

    expect(viewModel.headline).toBe("타임라인 이벤트 1건이 반영되었습니다.");
    expect(viewModel.actions.map((action) => action.id)).toEqual(["timeline"]);
    expect(viewModel.actions[0]).toMatchObject({ primary: true });
  });
});
