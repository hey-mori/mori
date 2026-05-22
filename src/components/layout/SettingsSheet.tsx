import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMoriAppStore } from "../../app/store";
import { SettingsView } from "../../features/settings/SettingsView";
import { AccountProfileView } from "../../features/account/AccountProfileView";

/**
 * Settings sheet — a modal overlay that hosts the settings + profile surfaces.
 *
 * Settings used to be a standing nav entry, which crowded the chrome with a
 * surface most users only visit occasionally. Lifted here: the user clicks
 * their avatar in the top bar and gets a centered sheet with the full
 * settings + profile surface. ESC and scrim close the sheet; the underlying
 * page state never changes, so closing returns the user exactly where they
 * were.
 */
export function SettingsSheet() {
  const open = useMoriAppStore((state) => state.settingsSheetOpen);
  const close = useMoriAppStore((state) => state.closeSettingsSheet);
  const tab = useMoriAppStore((state) => state.settingsSheetTab);
  const setTab = useMoriAppStore((state) => state.setSettingsSheetTab);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    // Focus the sheet so screen readers announce the dialog and keys route here.
    sheetRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div
        className="settings-sheet-scrim"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="프로필 및 설정"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <nav className="settings-sheet-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "profile"}
              className={`settings-sheet-tab${tab === "profile" ? " is-active" : ""}`}
              onClick={() => setTab("profile")}
            >
              프로필
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "settings"}
              className={`settings-sheet-tab${tab === "settings" ? " is-active" : ""}`}
              onClick={() => setTab("settings")}
            >
              설정
            </button>
          </nav>
          <button
            type="button"
            className="settings-sheet-close"
            onClick={close}
            aria-label="닫기"
            title="닫기 (Esc)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="settings-sheet-body">
          {tab === "profile" ? <AccountProfileView /> : <SettingsView />}
        </div>
      </div>
    </div>
  );
}
