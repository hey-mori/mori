import { describe, expect, it } from "vitest";
import {
  STALE_VERIFICATION_THRESHOLD_MS,
  formatVerificationAge,
  getRepositoryVerificationFreshness,
  isRepositoryVerificationStale,
} from "./verificationFreshness";
import type { RepositoryVerificationMetadata } from "./repositorySettings";

const NOW_MS = Date.parse("2026-05-12T18:00:00Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function verified(at: string): RepositoryVerificationMetadata {
  return {
    status: "verified",
    verifiedAt: at,
    gitRoot: "/repo",
    currentBranch: "main",
    headCommit: "deadbeefcafebabe",
    shortHeadCommit: "deadbee",
  };
}

describe("getRepositoryVerificationFreshness", () => {
  it("returns the unverified tone for missing metadata", () => {
    const result = getRepositoryVerificationFreshness(undefined, { now: NOW_MS });
    expect(result.tone).toBe("unverified");
    expect(result.label).toBe("미인증");
    expect(result.isStale).toBe(false);
    expect(result.ageMs).toBeNull();
  });

  it("reports failed metadata with its error message", () => {
    const result = getRepositoryVerificationFreshness(
      { status: "failed", error: "fatal: not a git repository" },
      { now: NOW_MS },
    );
    expect(result.tone).toBe("failed");
    expect(result.label).toContain("인증 실패");
    expect(result.label).toContain("not a git repository");
    expect(result.isStale).toBe(false);
  });

  it("labels a fresh verification with a friendly age", () => {
    const verifiedAt = new Date(NOW_MS - 10 * MINUTE).toISOString();
    const result = getRepositoryVerificationFreshness(verified(verifiedAt), { now: NOW_MS });
    expect(result.tone).toBe("fresh");
    expect(result.label).toMatch(/인증됨 · \d+분 전/);
    expect(result.isStale).toBe(false);
    expect(result.ageMs).toBe(10 * MINUTE);
  });

  it("marks verification past the default 24h threshold as stale", () => {
    const verifiedAt = new Date(NOW_MS - 30 * HOUR).toISOString();
    const result = getRepositoryVerificationFreshness(verified(verifiedAt), { now: NOW_MS });
    expect(result.tone).toBe("stale");
    expect(result.isStale).toBe(true);
    expect(result.label).toMatch(/^인증 만료/);
  });

  it("handles the epoch:<seconds> format the Rust verifier emits", () => {
    const epochSeconds = Math.floor((NOW_MS - 2 * DAY) / SECOND);
    const result = getRepositoryVerificationFreshness(
      verified(`epoch:${epochSeconds}`),
      { now: NOW_MS },
    );
    expect(result.tone).toBe("stale");
    expect(result.label).toMatch(/2일 전/);
  });

  it("treats unparseable timestamps gracefully", () => {
    const result = getRepositoryVerificationFreshness(verified("not-a-date"), { now: NOW_MS });
    expect(result.tone).toBe("fresh");
    expect(result.ageLabel).toBeNull();
    expect(result.isStale).toBe(false);
    expect(result.label).toBe("인증됨");
  });

  it("clamps future-dated verification timestamps to age 0", () => {
    const verifiedAt = new Date(NOW_MS + 2 * HOUR).toISOString();
    const result = getRepositoryVerificationFreshness(verified(verifiedAt), { now: NOW_MS });
    expect(result.ageMs).toBe(0);
    expect(result.label).toBe("인증됨 · 방금");
  });

  it("isRepositoryVerificationStale uses the configurable threshold", () => {
    const verifiedAt = new Date(NOW_MS - 2 * HOUR).toISOString();
    expect(isRepositoryVerificationStale(verified(verifiedAt), { now: NOW_MS })).toBe(false);
    expect(
      isRepositoryVerificationStale(verified(verifiedAt), { now: NOW_MS, thresholdMs: HOUR }),
    ).toBe(true);
  });
});

describe("formatVerificationAge", () => {
  it("returns null for missing or invalid timestamps", () => {
    expect(formatVerificationAge(undefined)).toBeNull();
    expect(formatVerificationAge("not-a-date")).toBeNull();
  });

  it("formats common age buckets in human readable units", () => {
    expect(formatVerificationAge(new Date(NOW_MS - 10 * SECOND).toISOString(), NOW_MS)).toBe("방금");
    expect(formatVerificationAge(new Date(NOW_MS - 2 * MINUTE).toISOString(), NOW_MS)).toBe("2분 전");
    expect(formatVerificationAge(new Date(NOW_MS - 3 * HOUR).toISOString(), NOW_MS)).toBe("3시간 전");
    expect(formatVerificationAge(new Date(NOW_MS - 2 * DAY).toISOString(), NOW_MS)).toBe("2일 전");
  });
});

describe("STALE_VERIFICATION_THRESHOLD_MS", () => {
  it("defaults to 24 hours", () => {
    expect(STALE_VERIFICATION_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
  });
});
