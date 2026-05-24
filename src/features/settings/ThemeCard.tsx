import { Check, Palette } from "lucide-react";
import { useMoriThemeStore } from "../../app/themeStore";
import type { MoriThemeId } from "../../lib/settings/themePreference";
import {
  PreferenceToggle,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

/**
 * Theme switcher card.
 *
 * Lets the user pick a local appearance theme. `formal` and `forest`
 * are real Layer-3 token sets and are selectable; `nightLake` is a
 * reserved Planned theme rendered as an honest, disabled option.
 * The choice is local-only — it never syncs and never affects data
 * access, capture, or memory.
 */

type ThemeOption = {
  id: MoriThemeId;
  label: string;
  sub: string;
  description: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "formal",
    label: "기본",
    sub: "Formal",
    description: "차분한 흰색·회색 표면과 보라 강조색. Mori의 기본 화면입니다.",
  },
  {
    id: "forest",
    label: "Forest",
    sub: "Sage",
    description: "세이지·스프루스 톤으로 살짝 따뜻하게 조정한 변형입니다.",
  },
  {
    id: "nightLake",
    label: "Night Lake",
    sub: "Dark",
    description: "어두운 배경에 밝은 텍스트. 야간 작업이나 저조도 환경에 적합합니다.",
  },
];

export function ThemeCard() {
  const theme = useMoriThemeStore((state) => state.theme);
  const setTheme = useMoriThemeStore((state) => state.setTheme);

  return (
    <SettingsSection
      title="Appearance"
      eyebrow="Display"
      description="Theme is applied and stored on this device. It does not sync and does not change capture, analysis, or memory behavior."
      action={<Palette size={16} aria-hidden="true" />}
    >
      <div className="theme-option-grid" role="radiogroup" aria-label="화면 테마">
        {THEME_OPTIONS.map((option) => {
          const selected = option.id === theme;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`theme-option${selected ? " selected" : ""}`}
              onClick={() => setTheme(option.id)}
            >
              <span className="theme-option-head">
                <strong>{option.label}</strong>
                {selected ? (
                  <span className="theme-option-check" aria-hidden="true">
                    <Check size={13} />
                  </span>
                ) : (
                  <span className="theme-option-sub">{option.sub}</span>
                )}
              </span>
              <span className="theme-option-description">{option.description}</span>
            </button>
          );
        })}
      </div>
      <div className="settings-row-list">
        <SettingsRow
          label="Display density"
          description="Compact and comfortable density controls are planned for dense review work."
          meta={<StatusPill tone="gray">Planned</StatusPill>}
          control={<PreferenceToggle label="Compact mode" active={false} disabled />}
          disabled
        />
        <SettingsRow
          label="Demo data visibility"
          description="Mori currently shows bundled demos only when there are no real saved sessions."
          meta={<StatusPill tone="blue">Automatic</StatusPill>}
        />
      </div>
    </SettingsSection>
  );
}
