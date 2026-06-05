import { Check } from "lucide-react";
import { useThemeStore } from "../../app/themeStore";
import type { ThemeId } from "../../lib/settings/themePreference";
import { SettingsSection } from "./SettingsPrimitives";

/**
 * Theme switcher.
 *
 * A single-select grid that scales as more themes ship: each is a tappable
 * card with a color preview, its name, and a one-line description. Selection
 * is shown by a tinted border + check, never a toggle (which would imply an
 * on/off per theme). The choice is local-only — it never syncs and never
 * affects data, capture, or memory.
 */

type ThemeOption = {
  id: ThemeId;
  label: string;
  description: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "formal",
    label: "기본",
    description: "차분한 흰색·회색 표면과 보라 강조색.",
  },
  {
    id: "forest",
    label: "Forest",
    description: "세이지·스프루스 톤으로 살짝 따뜻하게.",
  },
  {
    id: "nightLake",
    label: "Night Lake",
    description: "어두운 배경에 밝은 텍스트. 저조도 환경에 적합.",
  },
];

export function ThemeCard() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <SettingsSection title="테마">
      <div className="settings-theme-grid" role="radiogroup" aria-label="테마">
        {THEME_OPTIONS.map((option) => {
          const selected = option.id === theme;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`settings-theme${selected ? " is-selected" : ""}`}
              onClick={() => setTheme(option.id)}
            >
              <span className={`settings-theme-preview theme-${option.id}`} aria-hidden="true" />
              <span className="settings-theme-name">
                {option.label}
                {selected ? <Check size={14} aria-hidden="true" /> : null}
              </span>
              <small>{option.description}</small>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
