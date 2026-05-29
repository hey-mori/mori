import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, ListTodo } from "lucide-react";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import { BaseSection } from "../../components/ui/BaseSection";
import { InfoHint } from "../../components/ui/InfoHint";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import type { ProjectSynthesis, SynthItem } from "../../lib/project/projectSynthesis";

/**
 * "이 프로젝트 종합" — a cross-session roll-up shown as three summary cards
 * (미해결 · 다음 할 일 · 결정), not three always-open lists.
 *
 * The cards carry the project-wide magnitude at a glance and stay compact, so
 * the page fits the viewport regardless of how many items a project has.
 * Clicking a card expands that category's items inline in a single bounded,
 * internally-scrolling list; clicking the active card collapses it again. Each
 * item still opens its source session. The cards are a selector, never a flat
 * board — only one category is open at a time and its list never grows the page.
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

  // The section opens collapsed (just the count cards) so it stays compact; the
  // user expands a category on demand. Reset when the project's shape changes.
  const [active, setActive] = useState<CardKey | null>(null);
  const signature = `${synthesis.totals.openIssues}-${synthesis.totals.pendingNextActions}-${synthesis.totals.decisions}`;
  useEffect(() => {
    setActive(null);
  }, [signature]);

  const activeCard = cards.find((card) => card.key === active) ?? null;

  return (
    <BaseSection
      className="project-synthesis"
      title="이 프로젝트 종합"
      actions={
        synthesis.hasContent ? (
          <InfoHint label="종합 설명">
            이 프로젝트의 모든 세션에서 미해결 이슈·다음 할 일·확정된 결정을 모았습니다.
            카드를 누르면 그 분류의 항목이 펼쳐지고, 항목을 누르면 해당 세션으로 이동합니다.
          </InfoHint>
        ) : undefined
      }
      ariaLabel="이 프로젝트 종합"
    >
      {!synthesis.hasContent ? (
        <p className="settings-empty">
          세션을 분석하면 핵심 결정·미해결·다음 할 일이 이 프로젝트 전체에서 여기로 모입니다.
        </p>
      ) : (
        <>
          <div className="project-synth-cards">
            {cards.map((card) => {
              const isActive = active === card.key;
              const disabled = card.total === 0;
              return (
                <button
                  key={card.key}
                  type="button"
                  className={`project-synth-card${isActive ? " is-active" : ""}`}
                  disabled={disabled}
                  aria-pressed={isActive}
                  aria-label={`${card.label} ${card.total}건`}
                  onClick={() => setActive(isActive ? null : card.key)}
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

          {activeCard && activeCard.items.length > 0 ? (
            <ul className="project-session-list project-synth-list base-scroll">
              {activeCard.items.map((item, index) => (
                <li key={`${item.sessionId}-${index}`}>
                  <BaseObjectRow
                    className="session-list-row"
                    leading={activeCard.icon}
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
          ) : null}
        </>
      )}
    </BaseSection>
  );
}
