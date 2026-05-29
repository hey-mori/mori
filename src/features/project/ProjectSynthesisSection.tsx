import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, ListTodo } from "lucide-react";
import type { ProjectSynthesis } from "../../lib/project/projectSynthesis";

/**
 * Project synthesis info cards — 미해결 · 다음 할 일 · 결정 counts shown beside
 * the activity heatmap.
 *
 * Purely informational: the cards surface the project-wide magnitude at a
 * glance and are not interactive; the items themselves live in their sessions.
 * Renders nothing until at least one session has contributed content.
 *
 * Presentational: it receives the already-computed synthesis (see
 * `useProjectSynthesis`).
 */

type SynthCard = {
  key: string;
  label: string;
  icon: ReactNode;
  total: number;
};

export function ProjectSynthesisSection({ synthesis }: { synthesis: ProjectSynthesis }) {
  if (!synthesis.hasContent) return null;

  const cards: SynthCard[] = [
    { key: "issues", label: "미해결", icon: <CircleAlert size={15} />, total: synthesis.totals.openIssues },
    {
      key: "actions",
      label: "다음 할 일",
      icon: <ListTodo size={15} />,
      total: synthesis.totals.pendingNextActions,
    },
    { key: "decisions", label: "결정", icon: <CheckCircle2 size={15} />, total: synthesis.totals.decisions },
  ];

  return (
    <dl className="project-synth-cards" aria-label="이 프로젝트 종합">
      {cards.map((card) => (
        <div className="project-synth-card" key={card.key}>
          <dt className="project-synth-card-top">
            <span className="project-synth-card-icon" aria-hidden="true">
              {card.icon}
            </span>
            <span className="project-synth-card-label">{card.label}</span>
          </dt>
          <dd className="project-synth-card-count">{card.total}</dd>
        </div>
      ))}
    </dl>
  );
}
