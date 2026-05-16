import { describe, expect, it } from "vitest";
import {
  describeRetentionFootprint,
  describeSessionStorageTarget,
} from "./sessionStorageTarget";

describe("describeSessionStorageTarget", () => {
  it("reports the browser localStorage target outside the desktop app", () => {
    const target = describeSessionStorageTarget({ isDesktop: false });

    expect(target.location).toBe("browser:localStorage");
    expect(target.label).toContain("localStorage");
    expect(target.detail).toBe("브라우저 localStorage");
  });

  it("reports the desktop ~/Mori/Records path inside the desktop app", () => {
    const target = describeSessionStorageTarget({ isDesktop: true });

    expect(target.location).toBe("~/Mori/Records");
    expect(target.label).toBe("~/Mori/Records");
    expect(target.detail).toContain("SQLite");
  });
});

describe("describeRetentionFootprint", () => {
  it("describes each recording mode without inventing a byte estimate", () => {
    expect(describeRetentionFootprint("summary")).toContain("요약");
    expect(describeRetentionFootprint("full")).toContain("원본");
    expect(describeRetentionFootprint("ephemeral")).toContain("자동 삭제");
  });

  it("never claims a numeric size", () => {
    for (const mode of ["summary", "full", "ephemeral"] as const) {
      expect(describeRetentionFootprint(mode)).not.toMatch(/\d/);
    }
  });
});
