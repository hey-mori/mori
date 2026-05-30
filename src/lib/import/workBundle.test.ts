import { describe, expect, it } from "vitest";
import {
  buildWorkBundlePreview,
  extractFilePaths,
  type WorkBundleItem,
} from "./workBundle";
import { buildWorkBundleFixtureItems } from "./fixtures/workBundleFixture";

const SESSION = { projectId: "proj-test", sessionId: "sess-test" };

function fixtureItems(): WorkBundleItem[] {
  return buildWorkBundleFixtureItems(SESSION);
}

describe("workBundle fixture", () => {
  it("normalizes every source into a candidate with at least one event", () => {
    const items = fixtureItems();
    // transcript + 1 codex bucket + git diff + 1 terminal bucket + note.
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.candidate.events.length).toBeGreaterThan(0);
      expect(item.candidate.source.sessionId).toBe(SESSION.sessionId);
    }
    const origins = items.map((item) => item.origin);
    expect(origins).toEqual([
      "ai-transcript",
      "connector-jsonl",
      "git-diff",
      "connector-jsonl",
      "manual-note",
    ]);
  });

  it("maps the connector buckets to the expected source kinds", () => {
    const items = fixtureItems();
    const codex = items.find((item) => item.id === "bundle-codex-run-0");
    const terminal = items.find((item) => item.id === "bundle-terminal-log-0");
    expect(codex?.candidate.source.kind).toBe("codexTranscript");
    expect(terminal?.candidate.source.kind).toBe("terminal");
  });
});

describe("buildWorkBundlePreview", () => {
  it("returns an empty preview for no items", () => {
    const preview = buildWorkBundlePreview([]);
    expect(preview.isEmpty).toBe(true);
    expect(preview.sourceCount).toBe(0);
    expect(preview.totalEventCount).toBe(0);
    expect(preview.detectedFamilies).toEqual([]);
    expect(preview.willCreate).toEqual({ sourceCount: 0, eventCount: 0, fileCount: 0 });
  });

  it("reconstructs the fixture as one composite work unit", () => {
    const items = fixtureItems();
    const preview = buildWorkBundlePreview(items);

    expect(preview.isEmpty).toBe(false);
    expect(preview.sourceCount).toBe(5);

    // Order of first appearance: transcript(ai) → codex(ai, seen) → git → terminal → note.
    expect(preview.detectedFamilies).toEqual(["ai", "git", "terminal", "manual"]);

    // No cross-source duplicates in the fixture: unique == sum of events.
    const expectedUnique = items.reduce((sum, item) => sum + item.candidate.events.length, 0);
    expect(preview.totalEventCount).toBe(expectedUnique);
    expect(preview.duplicateEventCount).toBe(0);

    // Files the work touched are detected from the captured evidence.
    expect(preview.detectedFiles).toContain("src/sync/queue.ts");
    expect(preview.detectedFiles).toContain("src/sync/conflict.ts");
    expect(preview.workContextHint).toBe("src/sync");

    // Title comes from the goal expressed in the first AI turn.
    expect(preview.proposedTitle.startsWith("We need offline note sync")).toBe(true);

    // The fixture is clean — no secrets, no pending redaction.
    expect(preview.secretFlagged).toBe(false);
    expect(preview.redactionPending).toBe(false);

    // Span is ordered and present.
    expect(preview.spanStart).not.toBeNull();
    expect(preview.spanEnd).not.toBeNull();
    expect(new Date(preview.spanStart!).getTime()).toBeLessThanOrEqual(
      new Date(preview.spanEnd!).getTime(),
    );

    // What-will-be-created mirrors the derived counts.
    expect(preview.willCreate.sourceCount).toBe(5);
    expect(preview.willCreate.eventCount).toBe(preview.totalEventCount);
    expect(preview.willCreate.fileCount).toBe(preview.detectedFiles.length);

    // Per-source provenance survives into the preview.
    const codexSource = preview.sources.find((source) => source.itemId === "bundle-codex-run-0");
    expect(codexSource?.family).toBe("ai");
    expect(codexSource?.eventCount).toBeGreaterThan(0);
  });

  it("counts cross-source duplicate events without double-creating them", () => {
    const items = fixtureItems();
    const codex = items.find((item) => item.id === "bundle-codex-run-0")!;
    const codexEventCount = codex.candidate.events.length;

    // Stage the same Codex run twice (re-imported the same JSONL).
    const withDuplicate: WorkBundleItem[] = [
      codex,
      { ...codex, id: "bundle-codex-run-dup" },
    ];
    const preview = buildWorkBundlePreview(withDuplicate);

    expect(preview.totalEventCount).toBe(codexEventCount);
    expect(preview.duplicateEventCount).toBe(codexEventCount);

    const dupSource = preview.sources.find((source) => source.itemId === "bundle-codex-run-dup");
    expect(dupSource?.newEventCount).toBe(0);
    expect(dupSource?.duplicateEventCount).toBe(codexEventCount);
  });
});

describe("proposedNextStep guidance", () => {
  it("suggests ready-to-apply for a clean spine-anchored bundle", () => {
    const preview = buildWorkBundlePreview(fixtureItems());
    expect(preview.proposedNextStep.reason).toBe("readyToApply");
    expect(preview.proposedNextStep.message).toContain("적용");
  });

  it("escalates to spineMissing when the bundle is rib-only", () => {
    const ribOnly = fixtureItems().filter(
      (item) => item.origin !== "ai-transcript" && item.origin !== "connector-jsonl",
    );
    const preview = buildWorkBundlePreview(ribOnly);
    expect(preview.proposedNextStep.reason).toBe("spineMissing");
    expect(preview.proposedNextStep.message).toContain("AI 대화");
  });

  it("returns empty guidance for an empty bundle", () => {
    const preview = buildWorkBundlePreview([]);
    expect(preview.proposedNextStep.reason).toBe("empty");
  });
});

describe("spine vs rib classification", () => {
  it("classifies AI-family sources as spine and the rest as ribs", () => {
    const items = fixtureItems();
    const preview = buildWorkBundlePreview(items);

    // Fixture: Claude transcript (spine) + Codex run (spine, ai family) +
    // git diff + terminal + note (all ribs). That's 2 spine + 3 ribs.
    expect(preview.spineSourceCount).toBe(2);
    expect(preview.ribSourceCount).toBe(3);
    expect(preview.spineMissing).toBe(false);
    expect(preview.spineSourceCount + preview.ribSourceCount).toBe(preview.sourceCount);
  });

  it("flags spineMissing when a bundle has ribs but no agent conversation", () => {
    const items = fixtureItems().filter(
      (item) => item.origin !== "ai-transcript" && item.origin !== "connector-jsonl",
    );
    const preview = buildWorkBundlePreview(items);

    expect(preview.spineSourceCount).toBe(0);
    expect(preview.ribSourceCount).toBeGreaterThan(0);
    expect(preview.spineMissing).toBe(true);
  });

  it("leaves spineMissing false for an empty bundle", () => {
    const preview = buildWorkBundlePreview([]);
    expect(preview.spineMissing).toBe(false);
    expect(preview.spineSourceCount).toBe(0);
    expect(preview.ribSourceCount).toBe(0);
  });
});

describe("extractFilePaths", () => {
  it("extracts pathed, dotted, and known-extension files", () => {
    const files = extractFilePaths(
      "Edited src/sync/queue.ts and conflict.ts; added queue.test.ts after running npm test",
    );
    expect(files).toContain("src/sync/queue.ts");
    expect(files).toContain("conflict.ts");
    // Multi-dot filename captured whole, not truncated to "test.ts".
    expect(files).toContain("queue.test.ts");
    expect(files).not.toContain("test.ts");
  });

  it("ignores URLs and version strings", () => {
    const files = extractFilePaths("see https://example.com/docs and tool 0.0.0-sample");
    expect(files).not.toContain("example.com/docs");
    expect(files.some((file) => file.includes("://"))).toBe(false);
    expect(files).not.toContain("0.0.0");
  });
});
