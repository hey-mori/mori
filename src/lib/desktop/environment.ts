declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function createDesktopUnavailableError(command: string): Error {
  return new Error(`Desktop command "${command}" requires the Tauri app. The web prototype cannot run native filesystem commands.`);
}
