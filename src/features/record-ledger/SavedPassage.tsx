/**
 * 저장한 구절 · the evidence a record was saved from, on the record itself.
 *
 * What it shows is what Mori holds: the excerpt the user chose to keep, who
 * wrote it and when, and when it was kept. It is a quote of a message, not the
 * conversation and not a claim about the world. 원본 열기 reads the original
 * back and checks that the same text is still there before showing it; when
 * the original is gone or no longer holds that text, it says so and the kept
 * excerpt stays as it is.
 */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useAppStore } from "../../app/store";
import { useSessionStore, type SourceHitOutcome } from "../../app/sessionStore";
import { InfoHint } from "../../components/ui/InfoHint";
import { parsePassageLocator, type PassageLocatorV1 } from "../../lib/capture/passageCapture";
import type { KernelSource, SourceLink } from "../../lib/record-kernel/kernelTypes";

/** The saved passage behind a record, when that is what its origin is. */
export function savedPassageOf(
  source: KernelSource | null,
  link: SourceLink | null,
): { source: KernelSource; locator: PassageLocatorV1 } | null {
  if (!source || source.kind !== "agent-session" || !source.rawBody) return null;
  const locator = parsePassageLocator(link?.locator);
  return locator ? { source, locator } : null;
}

type OpenOutcome = SourceHitOutcome | "unverifiable";

const OUTCOME: Partial<Record<OpenOutcome, string>> = {
  missing: "원본 대화가 더 이상 없습니다. 저장한 구절만 남아 있습니다.",
  changed: "원본이 바뀌어 이 구절을 다시 찾을 수 없습니다. 저장한 구절은 그대로입니다.",
  // A redacted passage is compared after redaction: a change in what Mori
  // hides, not only in the original, can make it fail to match.
  unverifiable: "원본에서 이 구절을 다시 확인하지 못했습니다. 저장한 구절은 그대로입니다.",
  failed: "원본을 읽지 못했습니다.",
};

function stamp(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SavedPassage({ source, locator }: { source: KernelSource; locator: PassageLocatorV1 }) {
  const openSession = useAppStore((state) => state.openSession);
  const openSessionAtPassage = useSessionStore((state) => state.openSessionAtPassage);
  const [opening, setOpening] = useState(false);
  const [outcome, setOutcome] = useState<OpenOutcome | null>(null);
  const sequence = useRef(0);
  // Leaving the record (or this block re-mounting) abandons an open in flight:
  // a slow verification must not pull the user into a session later.
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  const written = stamp(source.publishedAt);
  const kept = stamp(source.capturedAt);

  const open = async () => {
    const mine = ++sequence.current;
    setOpening(true);
    setOutcome(null);
    const result = await openSessionAtPassage({ locator, stillWanted: () => mine === sequence.current });
    if (mine !== sequence.current) return;
    setOpening(false);
    if (result === "opened") openSession("flow");
    else setOutcome(result === "changed" && locator.redacted ? "unverifiable" : result);
  };

  return (
    <section className="saved-passage" aria-label="저장한 구절">
      <p className="saved-passage-head">
        저장한 구절
        <span className="saved-passage-meta">
          에이전트 대화{written ? ` · 메시지 ${written}` : ""}
          {kept ? ` · 저장 ${kept}` : ""}
          {source.retention === "redacted" ? " · 가린 부분 있음" : ""}
        </span>
        <InfoHint label="저장한 구절 설명">
          이 기록을 만들 때 대화에서 저장한 구절입니다. 대화 전체가 아니라 이 부분만 Mori에 남아
          있고, 원본 대화가 지워져도 남습니다. 에이전트가 그때 한 말이며, 지금도 사실인지는 따로
          확인해야 합니다.
        </InfoHint>
      </p>
      <blockquote className="saved-passage-quote">{source.rawBody}</blockquote>
      <div className="saved-passage-foot">
        <button type="button" className="saved-passage-open" disabled={opening} onClick={() => void open()}>
          {opening ? <Loader2 size={12} className="session-window-spin" aria-hidden="true" /> : <ExternalLink size={12} aria-hidden="true" />}
          원본 열기
        </button>
        {outcome && OUTCOME[outcome] ? (
          <span className="saved-passage-outcome" role="status">
            {OUTCOME[outcome]}
          </span>
        ) : null}
      </div>
    </section>
  );
}
