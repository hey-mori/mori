import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectLiveSection } from "./ProjectLiveSection";

describe("현재 상황 aside for unconfirmed observations", () => {
  it("says unconfirmed work was seen even when no member was observed", () => {
    const html = renderToStaticMarkup(<ProjectLiveSection projection={null} unconfirmedObserved={2} />);
    expect(html).toContain("확정하지 않은 세션 2개의 관찰은 넣지 않았습니다");
    expect(html).not.toContain("ctx-live-count");
  });

  it("renders nothing when there is nothing observed at all", () => {
    expect(renderToStaticMarkup(<ProjectLiveSection projection={null} />)).toBe("");
  });
});
