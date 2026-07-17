import { describe, expect, it } from "vitest";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { deriveNoteTitle } from "./noteWorkspace";
import { noteBacklinks, parseWikiTitles, resolveNoteByTitle, wikiLinkKey } from "./wikiLinks";

function note(id: string, title: string, body: string, over: Partial<MoriRecord> = {}): MoriRecord {
  return {
    id,
    schemaId: "note",
    title,
    body,
    capturedAt: "2026-07-17T00:00:00.000Z",
    timeBasis: "capture-fallback",
    status: "active",
    origin: "user",
    ownership: "self",
    contextIds: [],
    properties: {},
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...over,
  } as MoriRecord;
}

describe("wikiLinkKey", () => {
  it("collapses case, whitespace, and NFC/NFD Hangul", () => {
    expect(wikiLinkKey("  Weekly  Review ")).toBe("weekly review");
    // NFD and NFC forms of 가 must key the same.
    const nfd = "가"; // ㄱ + ㅏ
    const nfc = "가"; // 가
    expect(wikiLinkKey(nfd)).toBe(wikiLinkKey(nfc));
  });
});

describe("parseWikiTitles", () => {
  it("extracts distinct titles in first-seen order", () => {
    expect(parseWikiTitles("see [[A]] and [[B]] and [[a]] again")).toEqual(["A", "B"]);
  });

  it("ignores empty or unterminated brackets", () => {
    expect(parseWikiTitles("[[ ]] and [[unclosed and text")).toEqual([]);
  });
});

describe("resolveNoteByTitle", () => {
  const records = [
    note("n1", "회의 노트", "회의 노트\n내용"),
    note("n2", "주간 회고", "주간 회고"),
    note("d1", "회의 노트", "회의 노트 old", { status: "discarded" }),
  ];

  it("matches a note by normalized title", () => {
    expect(resolveNoteByTitle("주간 회고", records)?.id).toBe("n2");
    expect(resolveNoteByTitle("  회의   노트 ", records)?.id).toBe("n1");
  });

  it("skips discarded notes and returns null on a miss", () => {
    expect(resolveNoteByTitle("없는 제목", records)).toBeNull();
  });

  it("resolves a full-length link to a note whose stored title was clipped at 80", () => {
    // deriveNoteTitle stores 80 chars + …, but the link carries the full text.
    const long = "가".repeat(120);
    const stored = { ...note("long", deriveNoteTitle(long), long) };
    expect(stored.title.endsWith("…")).toBe(true);
    expect(resolveNoteByTitle(long, [stored])?.id).toBe("long");
    // The clipped form the user actually sees still resolves too.
    expect(resolveNoteByTitle(stored.title, [stored])?.id).toBe("long");
  });

  it("breaks title collisions by most recently updated", () => {
    const dup = [
      note("old", "겹침", "겹침", { updatedAt: "2026-07-10T00:00:00.000Z" }),
      note("new", "겹침", "겹침", { updatedAt: "2026-07-16T00:00:00.000Z" }),
    ];
    expect(resolveNoteByTitle("겹침", dup)?.id).toBe("new");
  });
});

describe("noteBacklinks", () => {
  it("finds notes whose body links to this note's title, excluding self", () => {
    const target = note("t", "설계 문서", "설계 문서\n본문");
    const records = [
      target,
      note("a", "A", "A\n[[설계 문서]] 참고"),
      note("b", "B", "B\n관련 없음"),
      note("c", "C", "C\n[[설계  문서]] 도 참조"), // whitespace variant still matches
      note("self", "설계 문서", "설계 문서\n[[설계 문서]] 자기참조"), // different id, but links to same title
    ];
    const ids = noteBacklinks(records, target).map((r) => r.id).sort();
    expect(ids).toEqual(["a", "c", "self"]);
  });

  it("returns nothing for an untitled note", () => {
    const blank = note("x", "", "");
    expect(noteBacklinks([blank, note("a", "A", "[[]]")], blank)).toEqual([]);
  });
});
