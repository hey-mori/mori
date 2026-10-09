import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedPassage, savedPassageOf } from "./SavedPassage";
import { formatPassageLocator, type PassageLocatorV1 } from "../../lib/capture/passageCapture";
import type { KernelSource, SourceLink } from "../../lib/record-kernel/kernelTypes";

const locator: PassageLocatorV1 = {
  v: 1,
  kind: "claude-code-record",
  sessionId: "auto-claude-abc",
  sourceId: "fp",
  start: 10,
  end: 90,
  anchor: "a1",
  messageId: "m1",
  from: 0,
  to: 21,
  excerptHash: "f".repeat(64),
};
const source: KernelSource = {
  id: "src-1",
  kind: "agent-session",
  locator: "mori:session/auto-claude-abc#10:a1:0-21",
  rawBody: "Decision: Candidate B",
  contentHash: "f".repeat(64),
  publishedAt: "2026-10-08T06:57:15.000Z",
  capturedAt: "2026-10-09T09:50:00.000Z",
  retention: "retained",
};
const link: SourceLink = { sourceId: "src-1", recordId: "rec-1", role: "origin", locator: formatPassageLocator(locator) };

describe("the evidence a record was saved from", () => {
  it("is a saved passage only for an agent-session source with a valid v1 locator", () => {
    expect(savedPassageOf(source, link)?.locator).toEqual(locator);
    expect(savedPassageOf({ ...source, kind: "text" }, link)).toBeNull();
    expect(savedPassageOf(source, { ...link, locator: "L1-2" })).toBeNull();
    expect(savedPassageOf(source, null)).toBeNull();
    expect(savedPassageOf({ ...source, rawBody: undefined }, link)).toBeNull();
  });

  it("shows the kept text, when it was written and kept, and offers the original", () => {
    const html = renderToStaticMarkup(<SavedPassage source={source} locator={locator} />);
    expect(html).toContain("저장한 구절");
    expect(html).toContain("Decision: Candidate B");
    expect(html).toContain("메시지 ");
    expect(html).toContain("저장 ");
    expect(html).toContain("원본 열기");
    expect(html).not.toContain("가린 부분 있음");
  });

  it("says when part of the kept text was hidden", () => {
    const html = renderToStaticMarkup(<SavedPassage source={{ ...source, retention: "redacted" }} locator={locator} />);
    expect(html).toContain("가린 부분 있음");
  });
});
