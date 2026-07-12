import {
  appendDiagnosticsEntry,
  describeThrown,
  type DiagnosticsEntry,
} from "../lib/diagnostics/diagnosticsLog";

/**
 * Global error monitor.
 *
 * Registers `error` and `unhandledrejection` listeners once and appends
 * each occurrence to the local diagnostics log (no remote telemetry;
 * the user exports the log from Settings when reporting a problem).
 * Console output is left untouched — DevTools behaviour stays normal.
 */

let installed = false;

export function installGlobalErrorMonitor(storage: Storage = window.localStorage): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const described = describeThrown(event.error ?? event.message);
    record(storage, {
      at: new Date().toISOString(),
      kind: "error",
      message: described.message,
      stack: described.stack,
      context: event.filename
        ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
        : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const described = describeThrown(event.reason);
    record(storage, {
      at: new Date().toISOString(),
      kind: "unhandledrejection",
      message: described.message,
      stack: described.stack,
    });
  });
}

function record(storage: Storage, entry: DiagnosticsEntry): void {
  try {
    appendDiagnosticsEntry(storage, entry);
  } catch {
    // The diagnostics path must never take down the app.
  }
}
