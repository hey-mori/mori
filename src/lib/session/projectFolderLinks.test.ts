import { describe, expect, it } from "vitest";
import {
  getProjectForFolder,
  rememberProjectForFolder,
} from "./projectFolderLinks";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("projectFolderLinks", () => {
  it("returns null for an unknown or empty folder", () => {
    const storage = fakeStorage();
    expect(getProjectForFolder("/repo/ng-gw", storage)).toBeNull();
    expect(getProjectForFolder("", storage)).toBeNull();
    expect(getProjectForFolder(undefined, storage)).toBeNull();
  });

  it("remembers and recalls the project chosen for a folder", () => {
    const storage = fakeStorage();
    rememberProjectForFolder("/repo/ng-gw", "Gateway", storage);
    expect(getProjectForFolder("/repo/ng-gw", storage)).toBe("Gateway");
  });

  it("keeps the last choice when a folder is re-filed under a different project", () => {
    const storage = fakeStorage();
    rememberProjectForFolder("/repo/ng-gw", "Gateway", storage);
    rememberProjectForFolder("/repo/ng-gw", "Edge", storage);
    expect(getProjectForFolder("/repo/ng-gw", storage)).toBe("Edge");
  });

  it("ignores empty folder keys or project labels", () => {
    const storage = fakeStorage();
    rememberProjectForFolder("", "Gateway", storage);
    rememberProjectForFolder("/repo/x", "   ", storage);
    expect(getProjectForFolder("/repo/x", storage)).toBeNull();
  });

  it("isolates links per folder", () => {
    const storage = fakeStorage();
    rememberProjectForFolder("/repo/front", "Web", storage);
    rememberProjectForFolder("/repo/back", "API", storage);
    expect(getProjectForFolder("/repo/front", storage)).toBe("Web");
    expect(getProjectForFolder("/repo/back", storage)).toBe("API");
  });
});
