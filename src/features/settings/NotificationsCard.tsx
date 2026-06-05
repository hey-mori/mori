import { useEffect, useState } from "react";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  setNotificationPreference,
  type NotificationCategory,
  type NotificationPreferences,
} from "../../lib/settings/notificationPreferences";
import {
  PreferenceToggle,
  SettingsRow,
  SettingsSection,
} from "./SettingsPrimitives";

const NOTIFICATION_ROWS: Array<{
  id: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    id: "importComplete",
    label: "가져오기 완료",
    description: "소스 가져오기가 끝나고 검토할 준비가 되었을 때.",
  },
  {
    id: "longRunningSessionUpdated",
    label: "긴 세션 업데이트",
    description: "저장된 긴 세션에 새 자료 또는 분석이 추가되었을 때.",
  },
  {
    id: "reportReady",
    label: "보고서 준비됨",
    description: "보고서 내보내기가 완료되었을 때.",
  },
  {
    id: "memoryReviewNeeded",
    label: "메모리 검토 필요",
    description: "프로젝트 메모리에 사용자의 명시적 검토가 필요한 항목이 있을 때.",
  },
  {
    id: "decisionIssueReviewNeeded",
    label: "결정 / 이슈 검토 필요",
    description: "분석이 확인이 필요한 결정이나 이슈를 찾았을 때.",
  },
  {
    id: "tokenAnomaly",
    label: "토큰 이상",
    description: "향후 제공자가 비정상적인 토큰 또는 비용 패턴을 보고할 때.",
  },
  {
    id: "sourceDisconnected",
    label: "소스 연결 끊김",
    description: "향후 connector가 명시적으로 연결 해제되거나 접근이 만료되었을 때.",
  },
  {
    id: "projectSummaryChanged",
    label: "프로젝트 요약 변경",
    description: "프로젝트 요약이 새 자료를 바탕으로 의미 있게 바뀌었을 때.",
  },
];

export function NotificationsCard() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() =>
    loadNotificationPreferences(),
  );

  useEffect(() => {
    saveNotificationPreferences(preferences);
  }, [preferences]);

  function toggle(category: NotificationCategory) {
    setPreferences((current) =>
      setNotificationPreference(current, category, !current.enabled[category]),
    );
  }

  return (
    <SettingsSection
      title="알림"
      description="범주 설정은 이 기기에 저장됩니다. OS 알림 전달은 아직 켜져 있지 않습니다."
    >
      <div className="settings-row-list">
        {NOTIFICATION_ROWS.map((row) => (
          <SettingsRow
            key={row.id}
            label={row.label}
            description={row.description}
            control={
              <PreferenceToggle
                label={`${row.label} 알림`}
                active={preferences.enabled[row.id]}
                onToggle={() => toggle(row.id)}
              />
            }
          />
        ))}
      </div>
    </SettingsSection>
  );
}
