import { describe, expect, it } from "vitest";
import { FIRST_PROJECT, projectChoices } from "./projectChoices";

describe("projectChoices", () => {
  it("offers a default project when the user has none", () => {
    expect(projectChoices([], [])).toEqual([FIRST_PROJECT]);
  });

  it("lists the user's projects, then their own session labels, once each", () => {
    expect(
      projectChoices([{ key: "mori" }, { key: " " }], [{ sourceLabel: "notes" }, { sourceLabel: "mori" }, {}]),
    ).toEqual(["mori", "notes"]);
  });

  it("does not offer the default once a real project exists", () => {
    expect(projectChoices([], [{ sourceLabel: "notes" }])).toEqual(["notes"]);
  });
});
