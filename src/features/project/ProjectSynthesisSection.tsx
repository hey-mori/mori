import { ArrowRight, CheckCircle2, CircleAlert, ListTodo } from "lucide-react";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import { MoriSection } from "../../components/ui/MoriSection";
import type { ProjectSynthesis, SynthItem } from "../../lib/project/projectSynthesis";

/**
 * "이 프로젝트 종합" — a cross-session roll-up of what the project has actually
 * been working on (key decisions / open issues / pending next actions),
 * replacing the per-session zero-count board.
 *
 * Presentational: it receives the already-computed synthesis (see
 * `useProjectSynthesis`) so the magnitude band and this section share one pass
 * over the project's sessions. The "how many" lives in the overview band; this
 * section is the "what" — the items themselves.
 */
export function ProjectSynthesisSection({
  synthesis,
  onOpenSession,
}: {
  synthesis: ProjectSynthesis;
  onOpenSession?: (sessionId: string) => void;
}) {
  return (
    <MoriSection
      className="project-synthesis"
      title="이 프로젝트 종합"
      ariaLabel="이 프로젝트 종합"
    >
      {!synthesis.hasContent ? (
        <p className="settings-empty">
          세션을 분석하면 핵심 결정·미해결·다음 할 일이 이 프로젝트 전체에서 여기로 모입니다.
        </p>
      ) : (
        <div className="project-session-groups">
          <SynthGroup
            label="결정"
            icon={<CheckCircle2 size={15} />}
            items={synthesis.decisions}
            onOpenSession={onOpenSession}
          />
          <SynthGroup
            label="미해결"
            icon={<CircleAlert size={15} />}
            items={synthesis.openIssues}
            onOpenSession={onOpenSession}
          />
          <SynthGroup
            label="다음 할 일"
            icon={<ListTodo size={15} />}
            items={synthesis.pendingNextActions}
            onOpenSession={onOpenSession}
          />
        </div>
      )}
    </MoriSection>
  );
}

function SynthGroup({
  label,
  icon,
  items,
  onOpenSession,
}: {
  label: string;
  icon: React.ReactNode;
  items: SynthItem[];
  onOpenSession?: (sessionId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="project-session-group">
      <p className="project-session-group-label">{label}</p>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.sessionId}-${index}`}>
            <MoriObjectRow
              leading={icon}
              title={item.text}
              meta={<MoriMetadataLine items={[item.sessionTitle]} />}
              onClick={onOpenSession ? () => onOpenSession(item.sessionId) : undefined}
              trailing={onOpenSession ? <ArrowRight size={13} aria-hidden="true" /> : undefined}
              density="compact"
              ariaLabel={item.text}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
