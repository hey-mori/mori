import { Bell, Info } from "lucide-react";
import { useEffect, useState } from "react";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  setNotificationPreference,
  type NotificationCategory,
  type NotificationPreferences,
} from "../../lib/settings/notificationPreferences";
import {
  LocalOnlyNotice,
  PreferenceToggle,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

const NOTIFICATION_ROWS: Array<{
  id: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    id: "importComplete",
    label: "Import complete",
    description: "A source import finishes and is ready for review.",
  },
  {
    id: "longRunningSessionUpdated",
    label: "Long-running session updated",
    description: "A saved session receives new evidence or analysis.",
  },
  {
    id: "reportReady",
    label: "Report ready",
    description: "A report export finishes in the background.",
  },
  {
    id: "memoryReviewNeeded",
    label: "Memory review needed",
    description: "Project memory has items waiting for explicit review.",
  },
  {
    id: "decisionIssueReviewNeeded",
    label: "Decision / issue review needed",
    description: "Quick Pass finds decisions or issues that need confirmation.",
  },
  {
    id: "tokenAnomaly",
    label: "Token anomaly",
    description: "A future provider reports an unusual token or cost pattern.",
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
      title="Notifications"
      eyebrow="Foundation"
      description="Mori has the preference model now. System delivery is not enabled yet, so these stay local and prepare the categories without pretending notifications are live."
      action={<StatusPill tone="gray">Local preference seam</StatusPill>}
    >
      <div className="settings-row-list">
        {NOTIFICATION_ROWS.map((row) => (
          <SettingsRow
            key={row.id}
            label={row.label}
            description={row.description}
            meta={<StatusPill tone="gray">Planned delivery</StatusPill>}
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
      <LocalOnlyNotice icon={Info} title="No notification service is running">
        These toggles are saved on this device so the delivery layer can honor them later.
        Mori does not request OS notification permission from this screen yet.
      </LocalOnlyNotice>
      <LocalOnlyNotice icon={Bell} title="Quiet by default">
        New notification categories start off until Mori has a real event source for them.
      </LocalOnlyNotice>
    </SettingsSection>
  );
}
