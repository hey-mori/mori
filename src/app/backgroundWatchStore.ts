import { create } from "zustand";
import {
  loadBackgroundWatchSettings,
  saveBackgroundWatchSettings,
  type BackgroundWatchSettings,
} from "../lib/background-watch/backgroundWatchSettings";
import type { BackgroundAnalysisResult } from "../lib/background-watch/backgroundAnalysis";
import type { InboxChange } from "../lib/background-watch/inboxWatch";

/**
 * Background watch store — the opt-in plus the detections it has surfaced.
 *
 * The watcher hook writes detections here; the review tray reads them. Detection
 * is review-gated: a detected item is a pointer to newly-arrived connector work,
 * not an applied import. Turning the watch off clears the tray (nothing pending
 * to act on while not watching). Settings persist to localStorage.
 */
export type DetectedInboxItem = {
  /** Absolute inbox file path (the import target). */
  path: string;
  /** Basename, for the tray label. */
  fileName: string;
  kind: "new" | "updated";
  /** ISO time the watch first surfaced this change. */
  detectedAt: string;
};

type BackgroundWatchState = {
  settings: BackgroundWatchSettings;
  detections: DetectedInboxItem[];
  /** Completed background analysis results, newest first. */
  analysisResults: BackgroundAnalysisResult[];
  setEnabled: (enabled: boolean) => void;
  setAutoAnalyze: (autoAnalyze: boolean) => void;
  addDetections: (changes: readonly InboxChange[], at: string) => void;
  dismissDetection: (path: string) => void;
  clearDetections: () => void;
  addAnalysisResult: (result: BackgroundAnalysisResult) => void;
  dismissAnalysisResult: (sessionId: string) => void;
};

export const useBackgroundWatchStore = create<BackgroundWatchState>((set, get) => ({
  settings: loadBackgroundWatchSettings(),
  detections: [],
  analysisResults: [],
  setEnabled: (enabled) => {
    const settings: BackgroundWatchSettings = {
      enabled,
      autoAnalyze: enabled ? get().settings.autoAnalyze : false,
    };
    saveBackgroundWatchSettings(settings);
    // Turning off clears the tray; turning on starts from an empty tray and a
    // fresh baseline (the hook re-baselines), so nothing stale lingers.
    set({ settings, detections: [] });
  },
  setAutoAnalyze: (autoAnalyze) => {
    const settings: BackgroundWatchSettings = { ...get().settings, autoAnalyze };
    saveBackgroundWatchSettings(settings);
    set({ settings });
  },
  addDetections: (changes, at) => {
    if (changes.length === 0) return;
    const byPath = new Map(get().detections.map((item) => [item.path, item]));
    for (const change of changes) {
      byPath.set(change.path, {
        path: change.path,
        fileName: basename(change.path),
        kind: change.kind,
        detectedAt: at,
      });
    }
    const detections = [...byPath.values()].sort((left, right) =>
      left.detectedAt < right.detectedAt ? 1 : -1,
    );
    set({ detections });
  },
  dismissDetection: (path) =>
    set({ detections: get().detections.filter((item) => item.path !== path) }),
  clearDetections: () => set({ detections: [] }),
  addAnalysisResult: (result) => {
    const prev = get().analysisResults.filter((r) => r.sessionId !== result.sessionId);
    set({ analysisResults: [result, ...prev].slice(0, 20) });
  },
  dismissAnalysisResult: (sessionId) =>
    set({ analysisResults: get().analysisResults.filter((r) => r.sessionId !== sessionId) }),
}));

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
