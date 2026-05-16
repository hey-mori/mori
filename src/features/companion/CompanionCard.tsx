import { Compass } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { ViewKey } from "../../domain/types";
import type {
  CompanionSignal,
  CompanionSignalBasis,
} from "../../lib/companion/companionSignals";

/**
 * Mori 노트 — the Companion Layer card.
 *
 * A calm, serious in-app panel that surfaces a few prioritised, evidence-based
 * signals derived from the current session. It is deliberately not a chatbot
 * and not a character: no avatar, no praise, no "I handled this for you". It
 * states what is worth a look and links to the surface that handles it.
 */
export function CompanionCard({
  signals,
  isDemo,
  onNavigate,
}: {
  signals: CompanionSignal[];
  isDemo: boolean;
  onNavigate: (view: ViewKey) => void;
}) {
  return (
    <section className="companion-card" aria-label="Mori 노트">
      <header className="companion-card-head">
        <span className="companion-card-mark" aria-hidden="true">
          <Compass size={15} />
        </span>
        <div className="companion-card-titles">
          <h3>Mori 노트</h3>
          <p>이번 세션에서 살펴볼 만한 것</p>
        </div>
        <Badge tone={signals.length > 0 ? "purple" : "gray"}>{signals.length}</Badge>
      </header>

      {signals.length === 0 ? (
        <p className="companion-empty">
          지금은 특별히 살펴볼 것이 없어요. 새 자료를 가져오거나 Quick Pass를
          실행하면 Mori가 다시 짚어 드립니다.
        </p>
      ) : (
        <ul className="companion-signal-list">
          {signals.map((signal) => (
            <li key={signal.id} className={`companion-signal sev-${signal.severity}`}>
              <span className="companion-signal-dot" aria-hidden="true" />
              <div className="companion-signal-body">
                <div className="companion-signal-head">
                  <strong>{signal.title}</strong>
                  <span className={`companion-signal-basis basis-${signal.basis}`}>
                    {basisLabel(signal.basis)}
                  </span>
                </div>
                <p>{signal.message}</p>
              </div>
              {signal.destination ? (
                <Button onClick={() => onNavigate(signal.destination as ViewKey)}>
                  {signal.actionLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <footer className="companion-card-foot">
        {isDemo
          ? "데모 데이터 기준입니다 — Mori는 사용자가 가져온 자료만 사용하며 백그라운드로 감시하지 않습니다."
          : "Mori는 사용자가 명시적으로 가져온 자료만 사용하며, 메모리를 자동으로 쓰지 않습니다."}
      </footer>
    </section>
  );
}

/** Calm Korean label for what a signal is grounded in. */
function basisLabel(basis: CompanionSignalBasis): string {
  switch (basis) {
    case "verified":
      return "확인된 데이터";
    case "inferred":
      return "추론 기반 · 확인 필요";
    case "mixed":
      return "검토 필요";
    case "state":
      return "세션 상태";
    default:
      return basis;
  }
}
