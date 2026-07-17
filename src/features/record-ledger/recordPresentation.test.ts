import { describe, expect, it } from "vitest";
import { originLabel } from "./recordPresentation";

describe("originLabel", () => {
  it("never claims the user typed a record the machine made", () => {
    // The lie this pins: the chip tested only `derived`, so `automation`,
    // `agent` and `import` all read "직접 입력". A session the background watcher
    // wrote unattended told the user they had typed it by hand, while the same
    // record's revision trail attributed it to 자동/Mori.
    expect(originLabel("automation")).toEqual({ label: "자동 수집", tone: "mori" });
    expect(originLabel("agent")).toEqual({ label: "에이전트 기록", tone: "mori" });
    expect(originLabel("import")).toEqual({ label: "가져옴", tone: "mori" });
  });

  it("still reads 직접 입력 only for what the user actually wrote", () => {
    expect(originLabel("user")).toEqual({ label: "직접 입력", tone: "user" });
  });

  it("keeps Mori가 정리 for a derived record", () => {
    expect(originLabel("derived")).toEqual({ label: "Mori가 정리", tone: "mori" });
  });
});
