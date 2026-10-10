import { describe, expect, it } from "vitest";
import { userEditOf } from "./userEdit";

describe("userEditOf", () => {
  it("drops the first-request mark on the stored record, keeping every newer property", () => {
    // The stored record is newer than the copy the user edited from: a live
    // session's count moved on. Only the mark may go.
    const stored = { title: "배포 고쳐줘", properties: { agentId: "claude", stepCount: 42, titleFromRequest: true } };
    expect(userEditOf(stored, { title: "내 이름" })).toEqual({
      title: "내 이름",
      properties: { agentId: "claude", stepCount: 42 },
    });
  });

  it("leaves every other edit as it is", () => {
    const stored = { title: "배포 고쳐줘", properties: { agentId: "claude", titleFromRequest: true } };
    expect(userEditOf(stored, { body: "메모" })).toEqual({ body: "메모" });
    expect(userEditOf(stored, { title: "배포 고쳐줘" })).toEqual({ title: "배포 고쳐줘" });
    expect(userEditOf({ title: "노트", properties: {} }, { title: "새 노트" })).toEqual({ title: "새 노트" });
  });
});
