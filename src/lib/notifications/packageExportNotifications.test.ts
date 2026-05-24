import { describe, expect, it } from "vitest";
import type { StoredMoriPackageDraft } from "../storage/storageTypes";
import type { MoriPackageV0 } from "../mori-package";
import {
  buildClientSafeMoriPackage,
  sampleMoriPackageV0,
} from "../mori-package";
import { buildPackageExportNotifications } from "./packageExportNotifications";

function draft({
  id,
  savedAt,
  pkg = sampleMoriPackageV0,
}: {
  id: string;
  savedAt: string;
  pkg?: MoriPackageV0;
}): StoredMoriPackageDraft {
  return {
    packageId: id,
    package: { ...pkg, manifest: { ...pkg.manifest, packageId: id } },
    savedAt,
    adapter: "browser-local-storage",
  };
}

const NOW = new Date("2026-05-24T15:00:00Z").getTime();

describe("buildPackageExportNotifications", () => {
  it("emits the most recent drafts in the window, newest first", () => {
    const notifications = buildPackageExportNotifications({
      now: NOW,
      drafts: [
        draft({ id: "old", savedAt: "2026-05-20T15:00:00Z" }),
        draft({ id: "fresh-1", savedAt: "2026-05-24T14:00:00Z" }),
        draft({ id: "fresh-2", savedAt: "2026-05-24T10:00:00Z" }),
      ],
    });
    expect(notifications.map((n) => n.id)).toEqual([
      "package-export:fresh-1",
      "package-export:fresh-2",
    ]);
    expect(notifications[0]!.kind).toBe("package_export_ready");
    expect(notifications[0]!.actionTarget).toEqual({
      kind: "view",
      view: "reports",
    });
  });

  it("caps the visible feed so a long history never floods the panel", () => {
    const many = Array.from({ length: 6 }).map((_, index) =>
      draft({
        id: `n-${index}`,
        savedAt: new Date(NOW - index * 60_000).toISOString(),
      }),
    );
    const notifications = buildPackageExportNotifications({
      now: NOW,
      drafts: many,
      limit: 2,
    });
    expect(notifications.map((n) => n.id)).toEqual([
      "package-export:n-0",
      "package-export:n-1",
    ]);
  });

  it("uses the client-safe variant title when the package was filtered", () => {
    const clientSafePkg = buildClientSafeMoriPackage(sampleMoriPackageV0);
    const notifications = buildPackageExportNotifications({
      now: NOW,
      drafts: [
        draft({
          id: "pkg-client-safe",
          savedAt: "2026-05-24T14:00:00Z",
          pkg: clientSafePkg,
        }),
      ],
    });
    expect(notifications[0]!.title).toContain("클라이언트 공유용");
  });

  it("ignores drafts with an unparseable savedAt instead of crashing", () => {
    const notifications = buildPackageExportNotifications({
      now: NOW,
      drafts: [draft({ id: "bad", savedAt: "not-a-date" })],
    });
    expect(notifications).toEqual([]);
  });
});
