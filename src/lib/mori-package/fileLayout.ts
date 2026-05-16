/**
 * `.mori` package — zip-like file-layout builder.
 *
 * `.mori v0` is one flat JSON object in memory and on export. The
 * documented future shape is a zip-like package — one file per slice
 * (`manifest.json`, `events.jsonl`, …). The actual zip archiving needs
 * an archiving dependency; this module ships the dependency-free half:
 * a pure function that turns a `MoriPackageV0` into the documented
 * multi-file layout as an in-memory `Record<string, string>`.
 *
 * Pure — no IO, no mutation. Every documented file is always present;
 * the optional, additive slices (`consolidatedMemories` / `auditTrail`)
 * are normalised to an empty list when absent, so the layout is
 * exhaustive and stable across package versions.
 */
import {
  getPackageAuditTrail,
  getPackageConsolidatedMemories,
} from "./deserialize";
import { serializeEventsJsonl } from "./serialize";
import type { MoriPackageV0 } from "./types";

/** Stable list of every file the zip-like layout contains, in order. */
export const MORI_PACKAGE_FILE_NAMES = [
  "manifest.json",
  "projects.json",
  "sessions.json",
  "events.jsonl",
  "issues.json",
  "decisions.json",
  "relationships.json",
  "sources.json",
  "next_actions.json",
  "artifacts.json",
  "summaries.json",
  "privacy.json",
  "theme.json",
  "consolidated_memories.json",
  "audit_trail.json",
] as const;

export type MoriPackageFileName = (typeof MORI_PACKAGE_FILE_NAMES)[number];

/** The zip-like layout: documented file name → serialised content. */
export type MoriPackageFileLayout = Record<MoriPackageFileName, string>;

/**
 * Build the zip-like file layout for a `.mori v0` package. The result
 * is the input for a future archiving step; today it round-trips the
 * same data the flat JSON export carries, one file per slice.
 */
export function buildMoriPackageFileLayout(
  pkg: MoriPackageV0,
): MoriPackageFileLayout {
  return {
    "manifest.json": json(pkg.manifest),
    "projects.json": json(pkg.projects),
    "sessions.json": json(pkg.sessions),
    "events.jsonl": serializeEventsJsonl(pkg),
    "issues.json": json(pkg.issues),
    "decisions.json": json(pkg.decisions),
    "relationships.json": json(pkg.relationships),
    "sources.json": json(pkg.sources),
    "next_actions.json": json(pkg.nextActions),
    "artifacts.json": json(pkg.artifacts),
    "summaries.json": json(pkg.summaries),
    "privacy.json": json(pkg.privacy),
    "theme.json": json(pkg.theme),
    // Optional, additive slices — normalised to `[]` when absent so
    // the layout is exhaustive regardless of the package's age.
    "consolidated_memories.json": json(getPackageConsolidatedMemories(pkg)),
    "audit_trail.json": json(getPackageAuditTrail(pkg)),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
