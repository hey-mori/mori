import { UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMoriAppStore, type SettingsTab } from "../../app/store";
import { SETTINGS_TAB_DEFS, SettingsView } from "../../features/settings/SettingsView";
import { AccountProfileView } from "../../features/account/AccountProfileView";
import { SettingsRail, type SettingsRailItem } from "../../features/settings/SettingsPrimitives";
import { focusFirstElement, trapTabKey } from "../ui/focusTrap";

const RAIL_ITEMS: SettingsRailItem[] = [
  {
    id: "profile",
    label: "프로필",
    description: "이 기기의 로컬 정체성",
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
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
            <strong id="settings-sheet-title">Mori 환경설정</strong>
            <span>이 기기에 저장되는 로컬 설정</span>
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
      return "표시 이름과 이니셜";
    case "localAi":
      return "Quick Pass 제공자";
    case "privacy":
      return "로컬 우선 보장";
    case "storage":
      return "SQLite와 내보내기";
    case "repositories":
      return "프로젝트 경로";
    case "appearance":
      return "테마와 밀도";
    case "notifications":
      return "알림 범주";
  }
}
