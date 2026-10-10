import { describe, expect, it } from "vitest";
import { labelText } from "./timelineCards";

describe("label text beside a tick", () => {
  it("drops the reader's leading tool glyph and keeps the rest", () => {
    expect(labelText("🔧 Bash: run tests")).toBe("Bash: run tests");
    expect(labelText("👨‍💻 Edit file")).toBe("Edit file");
    expect(labelText("CI 실행 기록")).toBe("CI 실행 기록");
  });
});
