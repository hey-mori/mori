/**
 * Search a project's conversations · the running search.
 *
 * Runs the plan in `lib/session/projectSearch`: bounded native steps over the
 * project's confirmed Claude Code sources, round-robin, at most
 * `PROJECT_SEARCH_CONCURRENCY` in flight and `PROJECT_SEARCH_PHASE_STEPS` per
 * phase, then stops and offers to go on.
 *
 * Transient. Nothing here is persisted: no query, no result, no copy of the
 * text. A search belongs to one project id; a newer search, stopping, closing
 * or a membership change stops accepting the old one's steps (cooperatively:
 * a native step already running finishes, and its reply is dropped).
 */
import { create } from "zustand";
import { searchClaudeCodeSession } from "../lib/claude/claudeTauri";
import type { ClaudeCodeSearchHit } from "../lib/claude/types";
import {
  applySourceBatch,
  applySourceError,
  canContinue,
  markSearching,
  pickSources,
  PROJECT_SEARCH_CONCURRENCY,
  PROJECT_SEARCH_PHASE_STEPS,
  PROJECT_SEARCH_STEP_HITS,
  restrictToMembers,
  startedProjectSearch,
  type ProjectSearchInventory,
  type ProjectSearchState,
} from "../lib/session/projectSearch";
import { classifyWindowError } from "../lib/session/sessionWindow";
import { historicalSourceAfterFailure, historicalSourceAfterRead, type HistoricalSource } from "../lib/session/historicalSource";
import { normalizeQuery } from "../lib/session/sessionSearch";
import { useSessionStore, type SourceHitOutcome } from "./sessionStore";

type ProjectSearchStore = {
  search: ProjectSearchState | null;
  /** The result being opened (`sessionId:recordStart`), and why one failed. */
  opening: string | null;
  openError: { key: string; outcome: Exclude<SourceHitOutcome, "opened" | "superseded"> } | null;
  /** The session a result last opened, for the way back to these results. */
  openedSessionId: string | null;
  /** Whole words unless `wholeWords` is false ("부분 일치"). */
  start: (inventory: Extract<ProjectSearchInventory, { kind: "ok" }>, query: string, wholeWords?: boolean) => Promise<void>;
  more: () => Promise<void>;
  stop: () => void;
  close: () => void;
  /** Keep only sources whose session is still a confirmed member. */
  restrict: (projectId: string, eligible: ReadonlySet<string>) => void;
  openHit: (sessionId: string, hit: ClaudeCodeSearchHit) => Promise<SourceHitOutcome>;
};

/** Bumped by every start, continue, stop and close: a step that finishes
 *  after that is dropped. */
let searchSequence = 0;
/** Bumped by every result opened and by every start or close: only the last
 *  result asked for, from the search still showing, may open. */
let openSequence = 0;

/** Sources caught mid-step by a stop go back to what they were. */
function settle(search: ProjectSearchState, status: ProjectSearchState["status"]): ProjectSearchState {
  const sources = { ...search.sources };
  for (const id of search.order) {
    const source = sources[id]!;
    if (source.status === "searching") sources[id] = { ...source, status: source.scanEnd === null ? "pending" : "partial" };
  }
  return { ...search, sources, status };
}

export const useProjectSearchStore = create<ProjectSearchStore>((set, get) => {
  /** One native step for one source, folded in if still current. */
  async function step(sequence: number, sessionId: string): Promise<void> {
    const search = get().search!;
    const source = search.sources[sessionId]!;
    try {
      const batch = await searchClaudeCodeSession(
        source.sourcePath,
        search.query,
        source.cursor && source.sourceId
          ? { beforeOffset: source.cursor.beforeOffset, sourceId: source.sourceId, anchor: source.cursor.anchor }
          : undefined,
        PROJECT_SEARCH_STEP_HITS,
        search.wholeWords,
      );
      const latest = get().search;
      if (sequence !== searchSequence || !latest) return;
      // The first step of an original says which file it is: the shared rule
      // decides before any of its hits count for this session.
      if (!source.archive && !source.sourceId) {
        const choice = await historicalSourceAfterRead(sessionId, batch);
        if (sequence !== searchSequence || !get().search) return;
        if (choice.kind !== "original") return useKeptOrFail(sequence, sessionId, choice);
      }
      const now = get().search!;
      const next = applySourceBatch(now, sessionId, batch);
      set({
        search:
          next === now
            ? applySourceError(now, sessionId, { kind: "changed", message: "SOURCE_CHANGED: the step does not continue the source." })
            : next,
      });
    } catch (error) {
      const latest = get().search;
      if (sequence !== searchSequence || !latest) return;
      if (source.archive) {
        set({ search: applySourceError(latest, sessionId, classifyWindowError(error)) });
        return;
      }
      // The original is gone: a copy the user kept is searched in its place,
      // from its end, and the coverage says which one was read.
      const choice = await historicalSourceAfterFailure(sessionId, error);
      if (sequence !== searchSequence || !get().search) return;
      return useKeptOrFail(sequence, sessionId, choice);
    }
  }

  /** Search the kept copy in the original's place, or record why not. */
  function useKeptOrFail(sequence: number, sessionId: string, choice: Exclude<HistoricalSource, { kind: "original" }>): Promise<void> | void {
    // Fresh state: other sources may have folded results in meanwhile.
    const now = get().search!;
    const held = now.sources[sessionId];
    if (choice.kind === "failed" || !held || held.status !== "searching") {
      if (choice.kind === "failed") set({ search: applySourceError(now, sessionId, choice.error) });
      return;
    }
    set({
      search: {
        ...now,
        sources: {
          ...now.sources,
          // The copy is searched from its end afresh: hits from the
          // original, if any, would otherwise repeat.
          [sessionId]: { ...held, sourcePath: choice.path, archive: choice.archive, cursor: null, sourceId: null, scanEnd: null, hits: [], steps: 0, unsearchableRecords: 0 },
        },
      },
    });
    return step(sequence, sessionId);
  }

  /** Run steps until the phase budget is spent, nothing is left, or the
   *  search is superseded. Every unfinished source is stepped before any is
   *  stepped again. */
  function run(sequence: number): Promise<void> {
    return new Promise((resolve) => {
      const busy = new Set<string>();
      const pump = () => {
        const search = get().search;
        if (!search || sequence !== searchSequence || search.status !== "searching") {
          if (busy.size === 0) resolve();
          return;
        }
        const slots = Math.min(PROJECT_SEARCH_CONCURRENCY - busy.size, PROJECT_SEARCH_PHASE_STEPS - search.phaseSteps);
        const { picked, next } = canContinue(search) && slots > 0 ? pickSources(search, busy, slots) : { picked: [], next: search.next };
        if (picked.length === 0) {
          if (busy.size === 0) {
            set({ search: settle(search, "idle") });
            resolve();
          }
          return;
        }
        set({ search: markSearching(search, picked, next) });
        for (const id of picked) {
          busy.add(id);
          void step(sequence, id).finally(() => {
            busy.delete(id);
            pump();
          });
        }
      };
      pump();
    });
  }

  return {
    search: null,
    opening: null,
    openError: null,
    openedSessionId: null,
    start: async (inventory, query, wholeWords = true) => {
      const phrase = normalizeQuery(query);
      if (!phrase) return;
      const sequence = ++searchSequence;
      openSequence += 1;
      set({ search: startedProjectSearch(inventory, phrase, wholeWords), opening: null, openError: null, openedSessionId: null });
      await run(sequence);
    },
    more: async () => {
      const search = get().search;
      if (!search || search.status === "searching" || !canContinue(search)) return;
      const sequence = ++searchSequence;
      set({ search: { ...search, status: "searching", phaseSteps: 0 } });
      await run(sequence);
    },
    stop: () => {
      searchSequence += 1;
      const search = get().search;
      if (search?.status === "searching") set({ search: settle(search, "stopped") });
    },
    close: () => {
      searchSequence += 1;
      openSequence += 1;
      set({ search: null, opening: null, openError: null, openedSessionId: null });
    },
    restrict: (projectId, eligible) => {
      const search = get().search;
      if (!search || search.projectId !== projectId) return;
      const next = restrictToMembers(search, eligible);
      if (next !== search) set({ search: next });
    },
    openHit: async (sessionId, hit) => {
      const search = get().search;
      const source = search?.sources[sessionId];
      if (!search || !source?.sourceId || source.status === "excluded") return "superseded";
      const sequence = ++openSequence;
      const key = `${sessionId}:${hit.recordStart}`;
      set({ opening: key, openError: null });
      const stillWanted = () => {
        const latest = get().search;
        return (
          sequence === openSequence &&
          latest?.projectId === search.projectId &&
          latest.sources[sessionId] !== undefined &&
          latest.sources[sessionId]!.status !== "excluded"
        );
      };
      const outcome = await useSessionStore.getState().openSessionAtSourceHit({
        sessionId,
        sourcePath: source.sourcePath,
        sourceId: source.sourceId,
        hit,
        query: search.query,
        wholeWords: search.wholeWords,
        stillWanted,
        archive: source.archive,
      });
      if (sequence !== openSequence) return "superseded";
      if (outcome === "opened") set({ opening: null, openedSessionId: sessionId });
      else if (outcome === "superseded") set({ opening: null });
      else set({ opening: null, openError: { key, outcome } });
      return outcome;
    },
  };
});
