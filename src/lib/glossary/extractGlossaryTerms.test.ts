import { describe, expect, it } from "vitest";
import { extractGlossaryTerms } from "./extractGlossaryTerms";
import type { SourceRef, TimelineEvent } from "../../domain/types";

function event(id: string, title: string, summary: string): TimelineEvent {
  return { id, title, summary } as unknown as TimelineEvent;
}

function source(id: string, title: string, detail: string): SourceRef {
  return { id, title, detail } as unknown as SourceRef;
}

function find(terms: ReturnType<typeof extractGlossaryTerms>["terms"], term: string) {
  return terms.find((t) => t.term === term);
}

describe("extractGlossaryTerms", () => {
  it("extracts a camelCase code identifier with its evidence ref", () => {
    const result = extractGlossaryTerms({
      events: [event("e1", "Add searchAcceptedMemories", "Wire searchAcceptedMemories into the card")],
    });
    const t = find(result.terms, "searchAcceptedMemories");
    expect(t?.kind).toBe("code");
    expect(t?.occurrences).toBe(2);
    expect(t?.evidenceRefs).toEqual([{ kind: "event", id: "e1", title: "Add searchAcceptedMemories" }]);
  });

  it("extracts acronyms and drops stopword acronyms", () => {
    const result = extractGlossaryTerms({
      events: [event("e1", "Use JWT for auth", "THE token is a JWT and an ID")],
    });
    expect(find(result.terms, "JWT")?.kind).toBe("acronym");
    expect(find(result.terms, "THE")).toBeUndefined();
    expect(find(result.terms, "ID")).toBeUndefined();
  });

  it("extracts capitalized phrases and strips a leading stopword", () => {
    const result = extractGlossaryTerms({
      events: [event("e1", "The Project Memory aggregates", "Project Memory is computed locally")],
    });
    const t = find(result.terms, "Project Memory");
    expect(t?.kind).toBe("phrase");
    expect(t?.occurrences).toBe(2);
  });

  it("treats path / dotted tokens as code but rejects numbers and prose abbreviations", () => {
    const result = extractGlossaryTerms({
      sources: [source("s1", "See src/lib/glossary", "Pi is 3.14, e.g. a constant in config.ts")],
    });
    expect(find(result.terms, "src/lib/glossary")?.kind).toBe("code");
    expect(find(result.terms, "config.ts")?.kind).toBe("code");
    expect(find(result.terms, "3.14")).toBeUndefined();
    expect(find(result.terms, "e.g")).toBeUndefined();
  });

  it("dedupes evidence refs by item but counts every mention", () => {
    const result = extractGlossaryTerms({
      events: [
        event("e1", "JWT chosen", "JWT JWT"),
        event("e2", "JWT revisited", "still JWT"),
      ],
    });
    const t = find(result.terms, "JWT");
    // e1: "JWT chosen" (1) + "JWT JWT" (2); e2: "JWT revisited" (1) + "still JWT" (1).
    expect(t?.occurrences).toBe(5);
    expect(t?.evidenceRefs).toHaveLength(2);
  });

  it("ranks more salient terms first and caps the result", () => {
    const result = extractGlossaryTerms({
      events: [event("e1", "JWT JWT JWT", "rareTerm appears once via camelCase")],
      maxTerms: 1,
    });
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0]?.term).toBe("JWT");
  });

  it("reports an honest data basis", () => {
    const result = extractGlossaryTerms({ events: [event("e1", "x", "y")], sources: [source("s1", "a", "b")] });
    expect(result.scannedItemCount).toBe(2);
    expect(result.dataBasis).toContain("local-only");
  });
});
