import { UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMoriAppStore, type SettingsTab } from "../../app/store";
import { SETTINGS_TAB_DEFS, SettingsView } from "../../features/settings/SettingsView";
import { AccountProfileView } from "../../features/account/AccountProfileView";
import { SettingsRail, type SettingsRailItem } from "../../features/settings/SettingsPrimitives";

const RAIL_ITEMS: SettingsRailItem[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Name, avatar, local identity",
    icon: UserRound,
  },
  ...SETTINGS_TAB_DEFS.map((item) => ({
    id: item.id,
    label: item.label,
    description: railDescriptionFor(item.id),
    icon: item.icon,
  })),
];

export function SettingsSheet() {
  const open = useMoriAppStore((state) => state.settingsSheetOpen);
  const close = useMoriAppStore((state) => state.closeSettingsSheet);
  const activeTab = useMoriAppStore((state) => state.settingsTab);
  const setActiveTab = useMoriAppStore((state) => state.setSettingsTab);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
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
          <div className="settings-sheet-title">
            <strong>Mori Preferences</strong>
            <span>Local-first setup for this device</span>
          </div>
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
          <SettingsRail
            items={RAIL_ITEMS}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as SettingsTab)}
          />
          <main className="settings-sheet-content mori-scroll">
            {activeTab === "profile" ? <AccountProfileView /> : <SettingsView />}
          </main>
        </div>
      </div>
    </div>
  );
}

function railDescriptionFor(tab: SettingsTab): string {
  switch (tab) {
    case "profile":
      return "Name, avatar, local identity";
    case "localAi":
      return "Quick Pass providers";
    case "privacy":
      return "Local-first guarantees";
    case "storage":
      return "SQLite, backups, data controls";
    case "repositories":
      return "Projects and import scope";
    case "appearance":
      return "Theme and density";
    case "notifications":
      return "Future alert categories";
  }
}
