import { UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAppStore, type SettingsTab } from "../../app/store";
import { SETTINGS_TAB_DEFS, SettingsView } from "../../features/settings/SettingsView";
import { AccountProfileView } from "../../features/account/AccountProfileView";
import { SettingsRail, type SettingsRailItem } from "../../features/settings/SettingsPrimitives";
import { focusFirstElement, trapTabKey } from "../ui/focusTrap";

const RAIL_ITEMS: SettingsRailItem[] = [
  { id: "profile", label: "프로필", icon: UserRound },
  ...SETTINGS_TAB_DEFS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
  })),
];

export function SettingsSheet() {
  const open = useAppStore((state) => state.settingsSheetOpen);
  const close = useAppStore((state) => state.closeSettingsSheet);
  const activeTab = useAppStore((state) => state.settingsTab);
  const setActiveTab = useAppStore((state) => state.setSettingsTab);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Retired tabs (privacy / repositories) may still be the persisted choice.
  // Fall back to a live tab so the pane never renders blank.
  useEffect(() => {
    if (!open) return;
    if (!RAIL_ITEMS.some((item) => item.id === activeTab)) {
      setActiveTab("localAi");
    }
  }, [open, activeTab, setActiveTab]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      trapTabKey(event, sheetRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => focusFirstElement(sheetRef.current));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
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
        aria-labelledby="settings-sheet-title"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong id="settings-sheet-title">설정</strong>
          </div>
          <button
            type="button"
            className="settings-sheet-close"
            onClick={close}
            aria-label="닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="settings-sheet-body">
          <SettingsRail
            items={RAIL_ITEMS}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as SettingsTab)}
          />
          <main className="settings-sheet-content base-scroll">
            {activeTab === "profile" ? <AccountProfileView /> : <SettingsView />}
          </main>
        </div>
      </div>
    </div>
  );
}
