import { Check, Palette } from "lucide-react";
import { useThemeStore } from "../../app/themeStore";
import type { ThemeId } from "../../lib/settings/themePreference";
import {
  PreferenceToggle,
  SettingsNotice,
  SettingsOption,
  SettingsOptionGroup,
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
  id: ThemeId;
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
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <SettingsSection
      title="화면 표시"
      description="테마는 이 기기에만 저장됩니다. 캡처, 분석, 메모리 동작에는 영향을 주지 않습니다."
      action={<Palette size={16} aria-hidden="true" />}
    >
      <SettingsOptionGroup label="화면 테마">
        {THEME_OPTIONS.map((option) => {
          const selected = option.id === theme;
          return (
            <SettingsOption
              key={option.id}
              selected={selected}
              icon={selected ? Check : Palette}
              label={option.label}
              description={option.description}
              meta={
                <>
                  <StatusPill tone={selected ? "purple" : "gray"}>
                    {selected ? "선택됨" : option.sub}
                  </StatusPill>
                  <span className={`theme-swatch theme-${option.id}`} aria-hidden="true" />
                </>
              }
              onClick={() => setTheme(option.id)}
            />
          );
        })}
      </SettingsOptionGroup>
      <div className="settings-row-list">
        <SettingsRow
          label="화면 밀도"
          description="검토 작업을 위한 Compact / Comfortable 전환은 아직 구현되지 않았습니다."
          meta={<StatusPill tone="gray">예정</StatusPill>}
          control={<PreferenceToggle label="Compact mode" active={false} disabled />}
          disabled
        />
        <SettingsRow
          label="데모 데이터 표시"
          description="실제 저장 세션이 없을 때만 번들 데모를 보여줍니다."
          meta={<StatusPill tone="blue">자동</StatusPill>}
        />
      </div>
      <SettingsNotice icon={Palette} title="로컬 표시 설정">
        테마 선택은 동기화되지 않으며 다른 기기나 내보내기 결과를 바꾸지 않습니다.
      </SettingsNotice>
    </SettingsSection>
  );
}
