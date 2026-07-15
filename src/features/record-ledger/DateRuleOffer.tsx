/**
 * DateRuleOffer · the one-line prompt Mori shows after the user has resolved
 * the same small-hours → previous-day correction a few times (R4b). Accepting
 * makes it a durable date rule; future small-hours captures then place
 * themselves on the previous day. Dismissing clears the counter so Mori does
 * not nag. Lives above the 확인할 것 strip so it survives an empty strip.
 */
import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";

export function DateRuleOffer({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="date-rule-offer">
      <Sparkles size={15} aria-hidden="true" className="date-rule-offer-icon" />
      <p className="date-rule-offer-text">
        새벽에 적은 기록을 앞으로 <strong>전날로</strong> 정리할까요?
      </p>
      <div className="date-rule-offer-actions">
        <Button variant="primary" size="sm" onClick={onAccept}>
          네, 자동으로
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          아니요
        </Button>
      </div>
    </section>
  );
}
