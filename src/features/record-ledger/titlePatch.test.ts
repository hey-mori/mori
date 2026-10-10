import { describe, expect, it } from "vitest";
import { titlePatch } from "./recordEditing";

describe("titlePatch", () => {
  it("drops the first-request mark with the old title, and touches nothing else", () => {
    expect(titlePatch({ properties: { agentId: "claude", titleFromRequest: true } }, "내 이름")).toEqual({
      title: "내 이름",
      properties: { agentId: "claude" },
    });
    expect(titlePatch({ properties: { agentId: "claude" } }, "내 이름")).toEqual({ title: "내 이름" });
  });
});
