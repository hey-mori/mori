import { describe, expect, it } from "vitest";
import {
  ConnectorInboxUnavailableError,
  formatConnectorFamily,
  formatInboxFileSize,
  formatInboxModifiedAt,
  isConnectorInboxAvailable,
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
} from "./connectorInbox";
import { isTauriRuntime } from "./environment";

describe("isConnectorInboxAvailable", () => {
  it("matches isTauriRuntime in the test runtime", () => {
    expect(isConnectorInboxAvailable()).toBe(isTauriRuntime());
  });

  it("returns false in the test (jsdom) runtime", () => {
    // Sanity check that the vitest environment is not pretending to be Tauri.
    expect(isConnectorInboxAvailable()).toBe(false);
  });
});

describe("listConnectorJsonlInbox browser fallback", () => {
  it("throws ConnectorInboxUnavailableError when no Tauri bridge is present", async () => {
    await expect(listConnectorJsonlInbox()).rejects.toBeInstanceOf(ConnectorInboxUnavailableError);
  });
});

describe("readConnectorJsonlFile browser fallback", () => {
  it("rejects empty paths before reaching the bridge", async () => {
    await expect(readConnectorJsonlFile("")).rejects.toThrow("required");
    await expect(readConnectorJsonlFile("   ")).rejects.toThrow("required");
  });

  it("throws ConnectorInboxUnavailableError when no Tauri bridge is present", async () => {
    await expect(readConnectorJsonlFile("/some/path.jsonl")).rejects.toBeInstanceOf(
      ConnectorInboxUnavailableError,
    );
  });
});

describe("ConnectorInboxUnavailableError", () => {
  it("carries a stable reason field components can branch on", () => {
    const err = new ConnectorInboxUnavailableError();
    expect(err.reason).toBe("browser-runtime");
    expect(err.name).toBe("ConnectorInboxUnavailableError");
    expect(err.message).toMatch(/desktop/i);
  });
});

describe("formatInboxFileSize", () => {
  it("renders bytes under 1 KB verbatim", () => {
    expect(formatInboxFileSize(0)).toBe("0 B");
    expect(formatInboxFileSize(512)).toBe("512 B");
  });

  it("renders KB with 1 decimal under 10 KB", () => {
    expect(formatInboxFileSize(2_300)).toBe("2.2 KB");
  });

  it("renders KB without decimals at or above 10 KB", () => {
    expect(formatInboxFileSize(48_000)).toBe("47 KB");
  });

  it("renders MB with 2 decimals under 10 MB", () => {
    expect(formatInboxFileSize(3_500_000)).toBe("3.34 MB");
  });

  it("returns em dash for non-finite inputs", () => {
    expect(formatInboxFileSize(Number.NaN)).toBe("—");
    expect(formatInboxFileSize(-5)).toBe("—");
  });
});

describe("formatInboxModifiedAt", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();

  it("renders 'just now' for sub-minute durations", () => {
    const iso = new Date(now - 10_000).toISOString();
    expect(formatInboxModifiedAt(iso, now)).toBe("just now");
  });

  it("renders minutes for sub-hour durations", () => {
    const iso = new Date(now - 15 * 60_000).toISOString();
    expect(formatInboxModifiedAt(iso, now)).toBe("15m ago");
  });

  it("renders hours for sub-day durations", () => {
    const iso = new Date(now - 3 * 60 * 60_000).toISOString();
    expect(formatInboxModifiedAt(iso, now)).toBe("3h ago");
  });

  it("renders days for sub-week durations", () => {
    const iso = new Date(now - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatInboxModifiedAt(iso, now)).toBe("2d ago");
  });

  it("falls back to a local-date string after one week", () => {
    const iso = new Date(now - 30 * 24 * 60 * 60_000).toISOString();
    const label = formatInboxModifiedAt(iso, now);
    expect(label).not.toMatch(/ago/);
    expect(label.length).toBeGreaterThan(3);
  });

  it("returns the raw value if it cannot be parsed", () => {
    expect(formatInboxModifiedAt("not-a-date", now)).toBe("not-a-date");
  });

  it("falls back to a locale string for future timestamps", () => {
    const iso = new Date(now + 60_000).toISOString();
    const label = formatInboxModifiedAt(iso, now);
    expect(label).not.toMatch(/ago/);
  });
});

describe("formatConnectorFamily", () => {
  it("maps the canonical family ids to display labels", () => {
    expect(formatConnectorFamily("claude-code")).toBe("Claude Code");
    expect(formatConnectorFamily("codex-cli")).toBe("Codex CLI");
    expect(formatConnectorFamily("terminal")).toBe("Terminal");
    expect(formatConnectorFamily("git")).toBe("Git");
    expect(formatConnectorFamily("other")).toBe("Other");
  });

  it("falls back to the raw id for unknown families", () => {
    expect(formatConnectorFamily("custom-family")).toBe("custom-family");
  });
});
