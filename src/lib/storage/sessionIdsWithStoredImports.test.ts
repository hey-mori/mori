import { describe, expect, it } from "vitest";
import { sessionIdsWithStoredImports } from "./localStorageAdapter";

const storageOf = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });

describe("sessions with a stored import, by key name", () => {
  it("reads entry keys and legacy arrays without parsing them", () => {
    const ids = sessionIdsWithStoredImports(
      storageOf([
        "mori.sessionImportEntry.auto-claude-abc.imp-1",
        "mori.sessionImportEntry.auto-claude-abc.imp-2",
        "mori.sessionImports.legacy-session",
        "mori.sessionDraft.auto-claude-placeholder",
        "mori.autoImport.v1",
      ]),
    );
    expect([...ids].sort()).toEqual(["auto-claude-abc", "legacy-session"]);
  });
});
