/**
 * What an agent-session record still says about its session when the session
 * itself cannot be opened (its transcript is gone and nothing was imported or
 * kept): when it ran and which PRs it mentioned, as recorded while the
 * transcript was there. Pure, so the rule is testable without the pane.
 */
import { readSessionEvidence } from "../../lib/record-kernel/agentSessionEvidence";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

export type SessionRecordFacts = {
  /** "9월 2일 – 9월 9일", or a single day, or null when undated. */
  period: string | null;
  /** Whether the transcript was read only in part, so PRs may be missing. */
  partial: boolean;
  /** PR numbers by repository, each in the order first seen. */
  prs: { repository: string; numbers: number[] }[];
};

function dayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function sessionRecordFacts(record: MoriRecord): SessionRecordFacts {
  const start = dayOf(record.occurredStart);
  const end = dayOf(record.occurredEnd);
  const period = start ? (end && end !== start ? `${start} – ${end}` : start) : null;
  const evidence = readSessionEvidence((record.properties as Record<string, unknown> | undefined)?.sessionEvidence);
  const prs: { repository: string; numbers: number[] }[] = [];
  for (const pr of evidence?.prs ?? []) {
    let group = prs.find((entry) => entry.repository === pr.repository);
    if (!group) prs.push((group = { repository: pr.repository, numbers: [] }));
    if (!group.numbers.includes(pr.number)) group.numbers.push(pr.number);
  }
  return { period, prs, partial: evidence?.coverage === "partial" };
}
