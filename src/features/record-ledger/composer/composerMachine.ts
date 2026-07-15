/**
 * Composer state machine · the six-state contract from
 * docs/design/record-workspace/interaction-and-state-spec.md §1.
 *
 * Pure reducer: IO (pipeline runs, persistence, draft storage) lives in the
 * component around it. States are a discriminated union so impossible
 * combinations (e.g. saving without an outcome, organizing twice) are
 * unrepresentable, and every illegal event on a state is a no-op rather than
 * a corruption.
 */
import type { CaptureOutcome } from "../../../lib/capture";

/** A user's staged correction to one candidate, keyed by record id. It is a
 *  view-level edit; `commitCapture` turns it into a `RecordPatch` and a user
 *  revision on top of the AI create revision. */
export type CandidateEdit = {
  schemaId?: string;
  title?: string;
  /** `null` clears the date (날짜 없이); a string sets a user-provided date. */
  occurredStart?: string | null;
  contextIds?: string[];
};

export type ComposerError = {
  /** engine-missing = no analysis engine reachable; parse = the engine ran
   *  but produced nothing usable; unknown = everything else. */
  kind: "engine-missing" | "parse" | "unknown";
  message: string;
};

export type ComposerState =
  | {
      phase: "idle";
      /** Draft text recovered from a previous session, offered for restore. */
      restoredDraft: string | null;
    }
  | { phase: "typing"; text: string }
  | { phase: "organizing"; text: string }
  | {
      phase: "reviewing";
      text: string;
      outcome: CaptureOutcome;
      edits: Record<string, CandidateEdit>;
      excluded: string[];
      /** True while the commit is in flight; blocks a second save. */
      saving: boolean;
    }
  | { phase: "saved"; savedRecordIds: string[]; undone: boolean }
  | { phase: "failed"; text: string; error: ComposerError };

export type ComposerEvent =
  | { type: "TYPE"; text: string }
  | { type: "CLEAR" }
  | { type: "RESTORE_ACCEPT" }
  | { type: "RESTORE_DISMISS" }
  | { type: "ORGANIZE" }
  | { type: "ORGANIZED"; outcome: CaptureOutcome }
  | { type: "ORGANIZE_FAILED"; error: ComposerError }
  | { type: "EDIT"; recordId: string; edit: CandidateEdit }
  | { type: "TOGGLE_EXCLUDE"; recordId: string }
  | { type: "BACK_TO_TEXT" }
  | { type: "SAVE_START" }
  | { type: "SAVED"; savedRecordIds: string[] }
  | { type: "SAVE_FAILED"; error: ComposerError }
  | { type: "UNDONE" }
  | { type: "RETRY" }
  | { type: "DISMISS" };

export const COMPOSER_IDLE: ComposerState = { phase: "idle", restoredDraft: null };

export function composerInitial(restoredDraft: string | null): ComposerState {
  return { phase: "idle", restoredDraft };
}

export function composerReduce(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case "TYPE": {
      // Typing is legal from idle and typing; a reviewing user goes BACK_TO_TEXT
      // first so staged edits are never silently thrown away.
      if (state.phase === "idle" || state.phase === "typing") {
        return event.text.trim().length === 0 && state.phase === "idle"
          ? state
          : { phase: "typing", text: event.text };
      }
      if (state.phase === "failed") return { phase: "typing", text: event.text };
      return state;
    }
    case "CLEAR": {
      if (state.phase === "typing" || state.phase === "failed") return COMPOSER_IDLE;
      return state;
    }
    case "RESTORE_ACCEPT": {
      if (state.phase === "idle" && state.restoredDraft) {
        return { phase: "typing", text: state.restoredDraft };
      }
      return state;
    }
    case "RESTORE_DISMISS": {
      if (state.phase === "idle") return COMPOSER_IDLE;
      return state;
    }
    case "ORGANIZE": {
      if (state.phase === "typing" && state.text.trim().length > 0) {
        return { phase: "organizing", text: state.text };
      }
      return state;
    }
    case "ORGANIZED": {
      if (state.phase === "organizing") {
        return {
          phase: "reviewing",
          text: state.text,
          outcome: event.outcome,
          edits: {},
          excluded: [],
          saving: false,
        };
      }
      return state;
    }
    case "ORGANIZE_FAILED": {
      if (state.phase === "organizing") {
        return { phase: "failed", text: state.text, error: event.error };
      }
      return state;
    }
    case "EDIT": {
      if (state.phase === "reviewing" && !state.saving) {
        const previous = state.edits[event.recordId] ?? {};
        return {
          ...state,
          edits: { ...state.edits, [event.recordId]: { ...previous, ...event.edit } },
        };
      }
      return state;
    }
    case "TOGGLE_EXCLUDE": {
      if (state.phase === "reviewing" && !state.saving) {
        const excluded = state.excluded.includes(event.recordId)
          ? state.excluded.filter((id) => id !== event.recordId)
          : [...state.excluded, event.recordId];
        return { ...state, excluded };
      }
      return state;
    }
    case "BACK_TO_TEXT": {
      if (state.phase === "reviewing" && !state.saving) {
        return { phase: "typing", text: state.text };
      }
      return state;
    }
    case "SAVE_START": {
      if (state.phase === "reviewing" && !state.saving) {
        return { ...state, saving: true };
      }
      return state;
    }
    case "SAVED": {
      if (state.phase === "reviewing" && state.saving) {
        return { phase: "saved", savedRecordIds: event.savedRecordIds, undone: false };
      }
      return state;
    }
    case "SAVE_FAILED": {
      if (state.phase === "reviewing" && state.saving) {
        return { phase: "failed", text: state.text, error: event.error };
      }
      return state;
    }
    case "UNDONE": {
      if (state.phase === "saved" && !state.undone) {
        return { ...state, undone: true };
      }
      return state;
    }
    case "RETRY": {
      if (state.phase === "failed" && state.text.trim().length > 0) {
        return { phase: "organizing", text: state.text };
      }
      return state;
    }
    case "DISMISS": {
      if (state.phase === "saved" || state.phase === "failed") return COMPOSER_IDLE;
      return state;
    }
  }
}

/** The record ids a save would persist: everything not excluded. */
export function keptRecordIds(state: Extract<ComposerState, { phase: "reviewing" }>): string[] {
  return state.outcome.records
    .map((item) => item.created.record.id)
    .filter((id) => !state.excluded.includes(id));
}
