import { describe, expect, it } from "vitest";
import { formatClaudeTimestamp, shortMessagePreview } from "./claudeTauri";

describe("formatClaudeTimestamp", () => {
  const now = Date.parse("2026-05-21T12:00:00Z");

  it("returns 'just now' for recent timestamps", () => {
    const recent = new Date(now - 5_000).toISOString();
    expect(formatClaudeTimestamp(recent, now)).toBe("just now");
  });

  it("renders minutes / hours / days for older entries", () => {
    expect(formatClaudeTimestamp(new Date(now - 10 * 60_000).toISOString(), now)).toBe("10m ago");
    expect(formatClaudeTimestamp(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3h ago");
    expect(formatClaudeTimestamp(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2d ago");
  });

  it("falls back to the raw value when the input cannot be parsed", () => {
    expect(formatClaudeTimestamp("not-a-timestamp")).toBe("not-a-timestamp");
    expect(formatClaudeTimestamp("")).toBe("—");
  });

  it("accepts epoch seconds and millis", () => {
    const epochSeconds = String(Math.floor(now / 1000) - 60);
    expect(formatClaudeTimestamp(epochSeconds, now)).toBe("1m ago");
    const epochMillis = String(now - 60_000);
    expect(formatClaudeTimestamp(epochMillis, now)).toBe("1m ago");
  });
});

describe("shortMessagePreview", () => {
  it("collapses whitespace and trims to the limit", () => {
    const out = shortMessagePreview("hello    world\n\n  again", 80);
    expect(out).toBe("hello world again");
  });

  it("ellipses long content", () => {
    const long = "abc".repeat(80);
    const out = shortMessagePreview(long, 30);
    expect(out.length).toBe(30);
    expect(out.endsWith("…")).toBe(true);
  });
});
