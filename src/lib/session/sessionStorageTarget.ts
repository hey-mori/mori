import type { RecordingMode } from "../../domain/types";

/**
 * Session storage honesty.
 *
 * The Start Session summary used to show a fixed `~/Mori/Records` path
 * and a fabricated daily-space estimate, while the line directly below
 * it said the data lives in browser localStorage. This module derives
 * both the real storage target for the current runtime and a
 * qualitative retention footprint from the chosen recording mode, so
 * the summary never claims a desktop path in the browser prototype or
 * invents a byte estimate Mori cannot actually measure.
 */

export type SessionStorageTarget = {
  /** Persisted onto the session draft's `storageLocation` field. */
  location: string;
  /** Short label for the summary "저장 위치" row. */
  label: string;
  /** Where the bytes actually live, for the draft-status detail line. */
  detail: string;
};

export function describeSessionStorageTarget(options: {
  isDesktop: boolean;
}): SessionStorageTarget {
  if (options.isDesktop) {
    return {
      location: "~/Mori/Records",
      label: "~/Mori/Records",
      detail: "데스크톱 SQLite · ~/Mori/Records",
    };
  }
  return {
    location: "browser:localStorage",
    label: "이 브라우저 (localStorage)",
    detail: "브라우저 localStorage",
  };
}

/**
 * Qualitative retention footprint for the chosen recording mode. Mori
 * cannot measure real disk use before a session runs, so this replaces
 * the old invented "하루 약 50MB ~ 200MB" estimate with an honest
 * description of how much each mode keeps.
 */
export function describeRetentionFootprint(mode: RecordingMode): string {
  switch (mode) {
    case "summary":
      return "요약 중심 — 원본은 짧게만 보관";
    case "full":
      return "원본 전체 보관 — 가장 많은 공간 사용";
    case "ephemeral":
      return "리포트만 보관 — 원본 자동 삭제";
  }
}
