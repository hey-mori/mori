import { Check } from "lucide-react";
import { useThemeStore } from "../../app/themeStore";
import {
  FONT_SCALE_STEPS,
  type ThemeFontScale,
  type ThemeId,
} from "../../lib/settings/themePreference";
import { SettingsSection } from "./SettingsPrimitives";

/**
 * Theme switcher + typography.
 *
 * A single-select grid of color themes that scales as more ship: each is a
 * tappable card with a color preview, name, and one-line description.
 * Selection is shown by a tinted border + check, never a toggle. Below it a
 * font-size control (slider over four steps) with a live preview line. The
 * choice is local-only — it never syncs and never affects data or memory.
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

const FONT_SCALE_LABEL: Record<ThemeFontScale, string> = {
  small: "작게",
  normal: "기본",
  large: "크게",
  xlarge: "아주 크게",
};

export function ThemeCard() {
  const theme = useThemeStore((state) => state.theme);
  const fontScale = useThemeStore((state) => state.fontScale);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setFontScale = useThemeStore((state) => state.setFontScale);

  return (
    <SettingsSection title="테마">
      <div className="settings-theme-stack">
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

        <FontSizeControl value={fontScale} onChange={setFontScale} />
      </div>
    </SettingsSection>
  );
}

function FontSizeControl({
  value,
  onChange,
}: {
  value: ThemeFontScale;
  onChange: (value: ThemeFontScale) => void;
}) {
  const index = Math.max(0, FONT_SCALE_STEPS.indexOf(value));
  return (
    <section className="settings-font" aria-label="글꼴 크기">
      <div className="settings-font-head">
        <strong>글꼴 크기</strong>
        <span className="settings-font-value">{FONT_SCALE_LABEL[value]}</span>
      </div>
      <input
        className="settings-font-slider"
        type="range"
        min={0}
        max={FONT_SCALE_STEPS.length - 1}
        step={1}
        value={index}
        aria-label="글꼴 크기"
        aria-valuetext={FONT_SCALE_LABEL[value]}
        onChange={(event) => {
          const next = FONT_SCALE_STEPS[Number(event.target.value)];
          if (next) onChange(next);
        }}
      />
      <div className="settings-font-ticks" aria-hidden="true">
        {FONT_SCALE_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            className={`settings-font-tick${step === value ? " is-selected" : ""}`}
            onClick={() => onChange(step)}
          >
            {FONT_SCALE_LABEL[step]}
          </button>
        ))}
      </div>
      <p className="settings-font-preview">
        Mori가 대화에서 이슈·결정·다음 액션을 정리합니다.
      </p>
    </section>
  );
}
