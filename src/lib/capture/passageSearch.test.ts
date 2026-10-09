import { describe, expect, it } from "vitest";
import type { KernelSource, SourceLink } from "../record-kernel/kernelTypes";
import { matchingPassage, passageSnippet, savedPassageTexts } from "./passageSearch";

const source = (id: string, rawBody: string, retention: KernelSource["retention"] = "retained", locator = `mori:session/s#${id}:a:0-1`): KernelSource => ({
  id,
  kind: "agent-session",
  locator,
  rawBody,
  capturedAt: "2026-10-09T00:00:00Z",
  retention,
});
const link = (sourceId: string, recordId: string): SourceLink => ({ sourceId, recordId, role: "origin" });

describe("saved passage texts", () => {
  it("collects what each record was saved from", () => {
    const texts = savedPassageTexts(
      [source("a", "멱등 키는 요청마다 새로 만든다"), source("b", "Retry with backoff"), source("c", "같은 구절", "retained")],
      [link("a", "r1"), link("b", "r1"), link("c", "r2")],
    );
    expect(texts.get("r1")).toEqual(["멱등 키는 요청마다 새로 만든다", "Retry with backoff"]);
    expect(texts.get("r2")).toEqual(["같은 구절"]);
  });

  it("keeps the redacted form only, and nothing Mori no longer keeps", () => {
    const texts = savedPassageTexts(
      [source("a", "token [가림]", "redacted"), source("b", "gone", "notCaptured")],
      [link("a", "r1"), link("b", "r1")],
    );
    expect(texts.get("r1")).toEqual(["token [가림]"]);
  });

  it("ignores sources that are not saved passages", () => {
    const texts = savedPassageTexts(
      [source("a", "archived body", "retained", "mori-archive:v1:{}"), source("b", "note raw", "retained", "capture:1")],
      [link("a", "r1"), link("b", "r1")],
    );
    expect(texts.size).toBe(0);
  });

  it("stores Korean in NFC so a typed query matches", () => {
    const nfd = "멱등".normalize("NFD");
    const texts = savedPassageTexts([source("a", `${nfd} 키`)], [link("a", "r1")]);
    expect(matchingPassage(texts.get("r1"), "멱등")).toBe("멱등 키");
  });
});

describe("matching and showing a passage hit", () => {
  it("matches case-insensitively", () => {
    expect(matchingPassage(["Retry With Backoff"], "backoff")).toBe("Retry With Backoff");
    expect(matchingPassage(["nothing"], "backoff")).toBeNull();
    expect(matchingPassage(undefined, "x")).toBeNull();
  });

  it("windows a long passage around the hit", () => {
    const text = `${"앞 ".repeat(60)}멱등 키${" 뒤".repeat(60)}`;
    const snippet = passageSnippet(text, "멱등", 30);
    expect(snippet).toContain("멱등 키");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("leads into a hit deep in a short passage so a narrow row keeps it", () => {
    const snippet = passageSnippet("Decision: the idempotency key rotates hourly with zebra jitter.", "zebra");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.startsWith("…zebra")).toBe(true);
  });

  it("returns a short passage whole, on one line", () => {
    expect(passageSnippet("a\n  b", "a")).toBe("a b");
  });
});
