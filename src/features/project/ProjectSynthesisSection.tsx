import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, ListTodo } from "lucide-react";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import { BaseSection } from "../../components/ui/BaseSection";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import type { ProjectSynthesis, SynthItem } from "../../lib/project/projectSynthesis";

/**
 * "이 프로젝트 종합" — a cross-session roll-up shown as three summary cards
 * (미해결 · 다음 할 일 · 결정).
 *
 * The cards carry the project-wide magnitude at a glance. Clicking a card
 * drills into a focused list of that category: the cards are replaced by a back
 * header and the full, internally-scrolling list, and each item opens its
 * source session. This keeps the synthesis actionable (every entry is a real
 * item you can jump to) and scales to large counts without an inline list ever
 * growing the page. Quantitative trends belong on the dashboard, not here.
 *
 * Presentational: it receives the already-computed synthesis (see
 * `useProjectSynthesis`) so the activity card and this section share one pass
 * over the project's sessions.
 */

type CardKey = "issues" | "actions" | "decisions";

type SynthCard = {
  key: CardKey;
  label: string;
  icon: ReactNode;
  total: number;
  items: SynthItem[];
};

export function ProjectSynthesisSection({
  synthesis,
  onOpenSession,
}: {
  synthesis: ProjectSynthesis;
  onOpenSession?: (sessionId: string) => void;
}) {
  const cards: SynthCard[] = [
    {
      key: "issues",
      label: "미해결",
      icon: <CircleAlert size={15} />,
      total: synthesis.totals.openIssues,
      items: synthesis.openIssues,
    },
    {
      key: "actions",
      label: "다음 할 일",
      icon: <ListTodo size={15} />,
      total: synthesis.totals.pendingNextActions,
      items: synthesis.pendingNextActions,
    },
    {
      key: "decisions",
      label: "결정",
      icon: <CheckCircle2 size={15} />,
      total: synthesis.totals.decisions,
      items: synthesis.decisions,
    },
  ];

  // Drill into one category at a time; reset when the project's shape changes.
  const [focused, setFocused] = useState<CardKey | null>(null);
  const signature = `${synthesis.totals.openIssues}-${synthesis.totals.pendingNextActions}-${synthesis.totals.decisions}`;
  useEffect(() => {
    setFocused(null);
  }, [signature]);

  const focusedCard = cards.find((card) => card.key === focused) ?? null;

  return (
    <BaseSection
      className="project-synthesis"
      title="이 프로젝트 종합"
      ariaLabel="이 프로젝트 종합"
    >
      {!synthesis.hasContent ? (
        <p className="settings-empty">
          세션을 분석하면 핵심 결정·미해결·다음 할 일이 여기에 정리됩니다.
        </p>
      ) : focusedCard ? (
        <div className="project-synth-focus">
          <div className="project-synth-focus-head">
            <button
              type="button"
              className="project-synth-back"
              onClick={() => setFocused(null)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>종합</span>
            </button>
            <span className="project-synth-focus-title">
              <span className="project-synth-card-icon" aria-hidden="true">
                {focusedCard.icon}
              </span>
              {focusedCard.label}
            </span>
            <span className="project-synth-focus-count">{focusedCard.total}건</span>
          </div>
          <ul className="project-session-list project-synth-list base-scroll">
            {focusedCard.items.map((item, index) => (
              <li key={`${item.sessionId}-${index}`}>
                <BaseObjectRow
                  className="session-list-row"
                  leading={focusedCard.icon}
                  title={item.text}
                  meta={
                    <BaseMetadataLine
                      items={[
                        item.sessionTitle,
                        item.timestamp ? formatSidebarRelative(item.timestamp) : null,
                      ]}
                    />
                  }
                  onClick={onOpenSession ? () => onOpenSession(item.sessionId) : undefined}
                  trailing={onOpenSession ? <ArrowRight size={13} aria-hidden="true" /> : undefined}
                  density="compact"
                  ariaLabel={item.text}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="project-synth-cards">
          {cards.map((card) => {
            const disabled = card.total === 0;
            return (
              <button
                key={card.key}
                type="button"
                className="project-synth-card"
                disabled={disabled}
                aria-label={`${card.label} ${card.total}건 열기`}
                onClick={() => setFocused(card.key)}
              >
                <span className="project-synth-card-top">
                  <span className="project-synth-card-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                  <span className="project-synth-card-label">{card.label}</span>
                </span>
                <span className="project-synth-card-count">{card.total}</span>
              </button>
            );
          })}
        </div>
      )}
    </BaseSection>
  );
}
