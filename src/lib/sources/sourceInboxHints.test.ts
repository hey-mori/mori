import { describe, expect, it } from "vitest";
import {
  buildSourceInboxHint,
  getInboxFamiliesForProvider,
  SOURCE_INBOX_PREVIEW_LIMIT,
} from "./sourceInboxHints";
import type { ConnectorInboxFile, ConnectorInboxListing } from "../desktop";

function file(
  connectorFamily: string,
  displayName: string,
  modifiedAt: string,
): ConnectorInboxFile {
  return {
    path: `/home/me/.mori/connectors/${connectorFamily}/${displayName}`,
    displayName,
    connectorFamily,
    sizeBytes: 1200,
    modifiedAt,
    relativePath: `${connectorFamily}/${displayName}`,
  };
}

function listing(files: ConnectorInboxFile[]): ConnectorInboxListing {
  return {
    rootPath: "/home/me/.mori/connectors",
    rootExists: true,
    files,
  };
}

describe("getInboxFamiliesForProvider", () => {
  it("maps native connector providers to their JSONL inbox families", () => {
    expect(getInboxFamiliesForProvider("claude")).toEqual(["claude-code"]);
    expect(getInboxFamiliesForProvider("codex")).toEqual(["codex-cli"]);
    expect(getInboxFamiliesForProvider("opencode")).toEqual(["opencode-cli"]);
    expect(getInboxFamiliesForProvider("mcp")).toEqual(["mcp"]);
  });

  it("maps local-capture evidence surfaces to the shared local-capture family", () => {
    expect(getInboxFamiliesForProvider("terminal")).toEqual(["local-capture", "terminal"]);
    expect(getInboxFamiliesForProvider("git")).toEqual(["local-capture", "git"]);
    expect(getInboxFamiliesForProvider("note")).toEqual(["local-capture"]);
    expect(getInboxFamiliesForProvider("ide")).toEqual(["local-capture"]);
  });

  it("keeps non-JSONL surfaces out of the inbox hint model", () => {
    expect(getInboxFamiliesForProvider("chatgpt")).toEqual([]);
    expect(getInboxFamiliesForProvider("cursor")).toEqual([]);
    expect(getInboxFamiliesForProvider("url")).toEqual([]);
  });
});

describe("buildSourceInboxHint", () => {
  it("filters and sorts provider-specific files while preserving root metadata", () => {
    const hint = buildSourceInboxHint(
      "codex",
      listing([
        file("claude-code", "claude.jsonl", "2026-05-14T10:00:00Z"),
        file("codex-cli", "old.jsonl", "2026-05-14T09:00:00Z"),
        file("codex-cli", "new.jsonl", "2026-05-14T11:00:00Z"),
      ]),
    );

    expect(hint).not.toBeNull();
    expect(hint!.rootPath).toBe("/home/me/.mori/connectors");
    expect(hint!.rootExists).toBe(true);
    expect(hint!.fileCount).toBe(2);
    expect(hint!.latestFile?.displayName).toBe("new.jsonl");
    expect(hint!.files.map((entry) => entry.displayName)).toEqual(["new.jsonl", "old.jsonl"]);
  });

  it("limits previews to the compact inspector count", () => {
    const files = Array.from({ length: SOURCE_INBOX_PREVIEW_LIMIT + 2 }, (_, index) =>
      file("local-capture", `${index}.jsonl`, `2026-05-14T1${index}:00:00Z`),
    );

    const hint = buildSourceInboxHint("terminal", listing(files));

    expect(hint?.fileCount).toBe(SOURCE_INBOX_PREVIEW_LIMIT + 2);
    expect(hint?.files).toHaveLength(SOURCE_INBOX_PREVIEW_LIMIT);
  });

  it("returns null when a provider has no connector JSONL family", () => {
    expect(buildSourceInboxHint("chatgpt", listing([]))).toBeNull();
  });
});
