/**
 * Honest result-state model for the Reports `.mori` package export
 * actions. The export surface used to collapse loading, success, and
 * failure into one untoned `<small>` line; this gives each phase a
 * stable tone and ARIA role so the user always knows what happened.
 *
 * The tone scale (`idle` / `info` / `ok` / `error`) matches the
 * Settings runtime-status dots, so the two surfaces read the same.
 */

export type MoriExportPhase = "idle" | "running" | "success" | "error" | "cancelled";

export type MoriExportTone = "idle" | "info" | "ok" | "error";

/** Which export action a phase belongs to (so both buttons can show state). */
export type MoriExportKind = "full" | "clientSafe";

/** Structured result of writing a `.mori` zip to disk / download. */
export interface MoriExportWriteResult {
  status: "saved" | "cancelled" | "error";
  message: string;
}

/** Map an export phase to the shared status tone. */
export function exportPhaseTone(phase: MoriExportPhase): MoriExportTone {
  switch (phase) {
    case "running":
      return "info";
    case "success":
      return "ok";
    case "error":
      return "error";
    case "cancelled":
    case "idle":
    default:
      return "idle";
  }
}

/**
 * Errors are announced assertively; everything else is a polite status
 * update so screen readers are not interrupted on every keystroke.
 */
export function exportPhaseRole(phase: MoriExportPhase): "status" | "alert" {
  return phase === "error" ? "alert" : "status";
}

/** Translate a write result into the phase the UI should settle on. */
export function phaseForWriteResult(result: MoriExportWriteResult): MoriExportPhase {
  switch (result.status) {
    case "saved":
      return "success";
    case "cancelled":
      return "cancelled";
    case "error":
    default:
      return "error";
  }
}

/** Short label for a running export, by which action is in flight. */
export function exportRunningLabel(kind: MoriExportKind): string {
  return kind === "clientSafe"
    ? "클라이언트 공유용 .mori 패키지를 만드는 중..."
    : ".mori 패키지를 만드는 중...";
}
