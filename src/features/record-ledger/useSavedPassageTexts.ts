/**
 * The saved passage texts of each record, read only while 기록 is searching,
 * so a record whose body was rewritten is still found by the words it was
 * saved from. Re-read when the ledger changes (`version`) during a search.
 */
import { useEffect, useState } from "react";
import { savedPassageTexts } from "../../lib/capture/passageSearch";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";

const EMPTY: ReadonlyMap<string, readonly string[]> = new Map();

export function useSavedPassageTexts(active: boolean, version: unknown): ReadonlyMap<string, readonly string[]> {
  const [texts, setTexts] = useState<ReadonlyMap<string, readonly string[]>>(EMPTY);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const repo = getKernelRepository();
    void Promise.all([repo.listSources(), repo.listSourceLinks()])
      .then(([sources, links]) => {
        if (!cancelled) setTexts(savedPassageTexts(sources.data, links.data));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, version]);
  return active ? texts : EMPTY;
}
