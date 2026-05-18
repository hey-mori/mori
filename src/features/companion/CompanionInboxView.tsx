import { useMemo } from "react";
import { ArrowRight, Compass, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";
import {
  companionSeverityTone,
  describeCompanionBasis,
  describeCompanionSeverity,
  getCompanionSignalActionTarget,
  groupCompanionSignalsByAction,
  type CompanionSignal,
  type CompanionSignalGroup,
} from "../../lib/companion/companionSignals";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import { useCompanionSignals } from "./useCompanionSignals";

/**
 * Companion Inbox — the Companion Layer's dedicated surface.
 *
 * The calm `CompanionCard` / `CompanionStrip` show a capped few signals
 * inline on work surfaces; this page is the full feed, organised by what
 * the user would *do* with each signal — review, risk, resume, report,
 * suggestion, reference — not by raw severity. Severity stays on each row
 * as a badge. Every signal is derived from data the user already imported
 * and reviewed; the inbox never watches anything and never writes memory.
 */
export function CompanionInboxView() {
  const { feed, isDemo } = useCompanionSignals();
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);

  const groups = useMemo(() => groupCompanionSignalsByAction(feed), [feed]);
  const topSignal = feed[0] ?? null;

  return (
    <div className="page companion-inbox">
      <PageHeader
        title="Mori 노트"
        subtitle="이번 작업에서 살펴볼 신호를 할 일 중심으로 정리했습니다. 모두 사용자가 가져온 소스에서 도출되며, Mori가 메모리를 자동으로 쓰지 않습니다."
      />
      <div className="companion-inbox-grid">
        <section className="companion-inbox-main" aria-label="Companion signals">
          {topSignal ? (
            <CompanionInboxFocus
              signal={topSignal}
              onNavigate={setCurrentView}
              onOpenReviewItem={openReviewItem}
            />
          ) : null}
          {groups.length === 0 ? (
            <p className="companion-inbox-empty">
              지금은 살펴볼 신호가 없습니다. 새 소스를 가져오거나 Quick Pass를
              실행하면 Mori가 다시 짚어 드립니다.
            </p>
          ) : (
            groups.map((group) => (
              <CompanionInboxSection
                key={group.category}
                group={group}
                onNavigate={setCurrentView}
                onOpenReviewItem={openReviewItem}
              />
            ))
          )}
        </section>

        <CompanionInboxRail groups={groups} total={feed.length} isDemo={isDemo} />
      </div>
    </div>
  );
}

function CompanionInboxFocus({
  signal,
  onNavigate,
  onOpenReviewItem,
}: {
  signal: CompanionSignal;
  onNavigate: (view: ViewKey) => void;
  onOpenReviewItem: (selection: ReviewSelection) => void;
}) {
  const target = getCompanionSignalActionTarget(signal);
  const action =
    target?.kind === "review"
      ? () => onOpenReviewItem(target.selection)
      : target?.kind === "view"
        ? () => onNavigate(target.view)
        : null;

  return (
    <section
      className="companion-inbox-focus"
      data-mori-tone={companionSeverityTone(signal.severity)}
      aria-label="추천 다음 행동"
    >
      <div className="companion-inbox-focus-copy">
        <span className="companion-inbox-focus-kicker">추천 다음 행동</span>
        <h2>{signal.title}</h2>
        <p>{signal.message}</p>
        <div className="companion-inbox-focus-meta">
          <span>{describeCompanionSeverity(signal.severity)}</span>
          <span>{describeCompanionBasis(signal.basis)}</span>
        </div>
      </div>
      {action ? (
        <Button variant="primary" onClick={action}>
          {signal.actionLabel}
        </Button>
      ) : null}
    </section>
  );
}

function CompanionInboxSection({
  group,
  onNavigate,
  onOpenReviewItem,
}: {
  group: CompanionSignalGroup;
  onNavigate: (view: ViewKey) => void;
  onOpenReviewItem: (selection: ReviewSelection) => void;
}) {
  return (
    <section className="companion-inbox-section" aria-label={group.label}>
      <header className="companion-inbox-section-head">
        <h2>{group.label}</h2>
        <span className="companion-inbox-section-count">{group.signals.length}</span>
        <p>{group.hint}</p>
      </header>
      <ul className="companion-inbox-list">
        {group.signals.map((signal) => (
          <CompanionSignalRow
            key={signal.id}
            signal={signal}
            onNavigate={onNavigate}
            onOpenReviewItem={onOpenReviewItem}
          />
        ))}
      </ul>
    </section>
  );
}

function CompanionSignalRow({
  signal,
  onNavigate,
  onOpenReviewItem,
}: {
  signal: CompanionSignal;
  onNavigate: (view: ViewKey) => void;
  onOpenReviewItem: (selection: ReviewSelection) => void;
}) {
  // When the signal is about a specific Review item, the action opens that
  // exact item; otherwise it navigates to the signal's surface. Either way
  // the action only navigates — it never applies or writes anything.
  const target = getCompanionSignalActionTarget(signal);
  const action =
    target?.kind === "review"
      ? () => onOpenReviewItem(target.selection)
      : target?.kind === "view"
        ? () => onNavigate(target.view)
        : null;
  return (
    <li
      className="companion-signal companion-inbox-row"
      data-mori-tone={companionSeverityTone(signal.severity)}
    >
      <span className="companion-signal-dot" aria-hidden="true" />
      <div className="companion-signal-body">
        <div className="companion-signal-head">
          <strong>{signal.title}</strong>
          <span className="companion-inbox-row-severity">
            {describeCompanionSeverity(signal.severity)}
          </span>
          <span className={`companion-signal-basis basis-${signal.basis}`}>
            {describeCompanionBasis(signal.basis)}
          </span>
        </div>
        <p>{signal.message}</p>
      </div>
      {action ? <Button onClick={action}>{signal.actionLabel}</Button> : null}
    </li>
  );
}

function CompanionInboxRail({
  groups,
  total,
  isDemo,
}: {
  groups: CompanionSignalGroup[];
  total: number;
  isDemo: boolean;
}) {
  return (
    <aside className="companion-inbox-rail" aria-label="Companion 요약">
      <section className="companion-inbox-rail-card">
        <header>
          <span className="companion-card-mark" aria-hidden="true">
            <Compass size={15} />
          </span>
          <h3>Companion 요약</h3>
        </header>
        {groups.length === 0 ? (
          <p className="companion-inbox-rail-total">살펴볼 신호가 없습니다.</p>
        ) : (
          <>
            <dl className="companion-inbox-rail-counts">
              {groups.map((group) => (
                <div key={group.category}>
                  <dt>{group.label}</dt>
                  <dd>{group.signals.length}</dd>
                </div>
              ))}
            </dl>
            <p className="companion-inbox-rail-total">
              살펴볼 신호 <strong>{total}</strong>건
            </p>
          </>
        )}
      </section>

      <section className="companion-inbox-rail-note">
        <ShieldCheck size={14} aria-hidden="true" />
        <p>
          {isDemo
            ? "데모 데이터 기준입니다. Mori는 사용자가 가져온 소스만 사용하며 백그라운드로 감시하지 않습니다."
            : "Mori는 사용자가 명시적으로 가져온 소스만 사용합니다. 메모리는 검토 후에만 저장되며, 자동으로 쓰지 않습니다."}
        </p>
      </section>

      <p className="companion-inbox-rail-hint">
        신호는 제안이며 사실이 아닙니다 <ArrowRight size={11} aria-hidden="true" /> 각 항목을
        검토 화면에서 직접 확인하세요.
      </p>
    </aside>
  );
}
