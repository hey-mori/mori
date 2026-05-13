import { describe, expect, it } from "vitest";
import {
  addRepositoryConfig,
  DEFAULT_REPOSITORY_SETTINGS,
  deriveLabelFromPath,
  removeRepositoryConfig,
  sanitizeRepositorySettings,
  setRepositoryVerification,
  setSelectedRepository,
  updateRepositoryConfig,
  type RepositoryVerificationMetadata,
} from "./repositorySettings";

const fixedNow = "2026-05-12T13:00:00+09:00";

describe("repository settings sanitization", () => {
  it("returns defaults for missing or invalid input", () => {
    expect(sanitizeRepositorySettings(undefined)).toEqual(DEFAULT_REPOSITORY_SETTINGS);
    expect(sanitizeRepositorySettings("oops")).toEqual(DEFAULT_REPOSITORY_SETTINGS);
    expect(sanitizeRepositorySettings({})).toEqual(DEFAULT_REPOSITORY_SETTINGS);
  });

  it("drops entries without a path and deduplicates by path", () => {
    const result = sanitizeRepositorySettings({
      repositories: [
        { id: "a", label: "A", path: "/repo/a", createdAt: fixedNow },
        { id: "b", label: "B", path: "", createdAt: fixedNow },
        { id: "c", label: "C", path: "/repo/a", createdAt: fixedNow },
        null,
      ],
      selectedRepositoryId: "a",
    });
    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0].path).toBe("/repo/a");
    expect(result.selectedRepositoryId).toBe("a");
  });

  it("falls back to the first repo when the selection is missing", () => {
    const result = sanitizeRepositorySettings({
      repositories: [
        { id: "a", label: "A", path: "/repo/a", createdAt: fixedNow },
        { id: "b", label: "B", path: "/repo/b", createdAt: fixedNow },
      ],
      selectedRepositoryId: "missing",
    });
    expect(result.selectedRepositoryId).toBe("a");
  });
});

describe("repository settings operations", () => {
  it("adds a repository and selects it when nothing was selected", () => {
    const { settings, repository } = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, {
      path: "/repo/mori",
      now: fixedNow,
    });
    expect(repository.path).toBe("/repo/mori");
    expect(repository.label).toBe("mori");
    expect(settings.repositories).toHaveLength(1);
    expect(settings.selectedRepositoryId).toBe(repository.id);
  });

  it("reuses an existing entry when re-adding the same path", () => {
    const first = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, { path: "/repo/mori", now: fixedNow });
    const second = addRepositoryConfig(first.settings, { path: "/repo/mori", label: "Mori App" });
    expect(second.settings.repositories).toHaveLength(1);
    expect(second.repository.id).toBe(first.repository.id);
    expect(second.repository.label).toBe("Mori App");
  });

  it("rejects empty paths", () => {
    expect(() => addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, { path: "  " })).toThrow();
  });

  it("removes a repository and falls back to the first remaining one", () => {
    const a = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, { path: "/a", now: fixedNow });
    const b = addRepositoryConfig(a.settings, { path: "/b", now: fixedNow });
    let settings = setSelectedRepository(b.settings, b.repository.id);
    settings = removeRepositoryConfig(settings, b.repository.id);
    expect(settings.repositories).toHaveLength(1);
    expect(settings.selectedRepositoryId).toBe(a.repository.id);
  });

  it("updates a label without touching siblings", () => {
    const a = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, { path: "/a", now: fixedNow });
    const b = addRepositoryConfig(a.settings, { path: "/b", now: fixedNow });
    const updated = updateRepositoryConfig(b.settings, a.repository.id, { label: "Renamed" });
    expect(updated.repositories.find((entry) => entry.id === a.repository.id)?.label).toBe("Renamed");
    expect(updated.repositories.find((entry) => entry.id === b.repository.id)?.label).toBe("b");
  });

  it("keeps the previous selection when selecting an unknown repo", () => {
    const a = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, { path: "/a", now: fixedNow });
    const updated = setSelectedRepository(a.settings, "nonexistent");
    expect(updated.selectedRepositoryId).toBe(a.repository.id);
  });

  it("derives sensible labels from paths", () => {
    expect(deriveLabelFromPath("/home/me/mori")).toBe("mori");
    expect(deriveLabelFromPath("C:\\dev\\mori")).toBe("mori");
    expect(deriveLabelFromPath("/")).toBe("repository");
  });
});

describe("repository verification metadata", () => {
  it("preserves verified metadata through sanitize", () => {
    const sanitized = sanitizeRepositorySettings({
      repositories: [
        {
          id: "r-a",
          label: "A",
          path: "/repo/a",
          createdAt: fixedNow,
          verification: {
            status: "verified",
            verifiedAt: fixedNow,
            gitRoot: "/repo/a",
            currentBranch: "main",
            headCommit: "0123456789abcdef",
            shortHeadCommit: "0123456",
            isDirty: true,
          },
        },
      ],
      selectedRepositoryId: "r-a",
    });
    expect(sanitized.repositories[0].verification?.status).toBe("verified");
    expect(sanitized.repositories[0].verification?.currentBranch).toBe("main");
    expect(sanitized.repositories[0].verification?.shortHeadCommit).toBe("0123456");
    expect(sanitized.repositories[0].verification?.isDirty).toBe(true);
  });

  it("derives shortHeadCommit when missing", () => {
    const sanitized = sanitizeRepositorySettings({
      repositories: [
        {
          id: "r-a",
          label: "A",
          path: "/repo/a",
          createdAt: fixedNow,
          verification: { status: "verified", headCommit: "deadbeefcafe1234" },
        },
      ],
    });
    expect(sanitized.repositories[0].verification?.shortHeadCommit).toBe("deadbee");
  });

  it("rejects unknown verification status values", () => {
    const sanitized = sanitizeRepositorySettings({
      repositories: [
        {
          id: "r-a",
          label: "A",
          path: "/repo/a",
          createdAt: fixedNow,
          verification: { status: "rogue" },
        },
      ],
    });
    expect(sanitized.repositories[0].verification?.status).toBe("unverified");
  });

  it("setRepositoryVerification persists a verified result and can clear it", () => {
    const { settings } = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, {
      path: "/repo/mori",
      now: fixedNow,
    });
    const repoId = settings.repositories[0].id;
    const verification: RepositoryVerificationMetadata = {
      status: "verified",
      verifiedAt: fixedNow,
      gitRoot: "/repo/mori",
      currentBranch: "main",
      headCommit: "0123456789abcdef",
      shortHeadCommit: "0123456",
      isDirty: false,
    };
    const withVerified = setRepositoryVerification(settings, repoId, verification);
    expect(withVerified.repositories[0].verification?.status).toBe("verified");

    const cleared = setRepositoryVerification(withVerified, repoId, null);
    expect(cleared.repositories[0].verification).toBeUndefined();
  });

  it("setRepositoryVerification stores failed status and error text", () => {
    const { settings } = addRepositoryConfig(DEFAULT_REPOSITORY_SETTINGS, {
      path: "/repo/mori",
      now: fixedNow,
    });
    const repoId = settings.repositories[0].id;
    const updated = setRepositoryVerification(settings, repoId, {
      status: "failed",
      verifiedAt: fixedNow,
      error: "fatal: not a git repository",
    });
    expect(updated.repositories[0].verification?.status).toBe("failed");
    expect(updated.repositories[0].verification?.error).toContain("not a git repository");
  });
});
