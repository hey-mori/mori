/**
 * OS-native notification bridge — fire a desktop notification for a gated
 * payload.
 *
 * Mori wraps the Tauri notification plugin in its own `send_os_notification`
 * command (so there is no JS plugin package or capability wiring); this calls it
 * through the same typed invoke path as every other Mori command. The browser
 * prototype has no desktop runtime, so it is a no-op there. Best-effort: a
 * failed OS notification never disturbs the in-app feed, which always carries
 * the same notice.
 */
import { isTauriRuntime } from "./environment";
import { invokeTauriCommand } from "./tauriCommands";
import type { OsNotificationPayload } from "../notifications/osNotification";

export async function sendOsNotification(payload: OsNotificationPayload): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invokeTauriCommand("send_os_notification", {
      title: payload.title,
      body: payload.body,
    });
  } catch {
    // Best-effort; the in-app bell already surfaces this notice.
  }
}
