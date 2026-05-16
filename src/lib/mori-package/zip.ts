/**
 * `.mori` package — real zip encode / decode layer.
 *
 * `buildMoriPackageFileLayout` / `parseMoriPackageFileLayout` define the
 * canonical internal package layout (one file per slice). This module
 * is the *packaging layer* on top of that: it archives the layout into
 * a real `.mori` zip file and reads it back. The file layout stays the
 * source of truth — zip is only a transport container.
 *
 * Pure and local: `fflate` is a small, dependency-free, pure-JS zip
 * library — no native code, no network. `unzipMoriPackage` runs the
 * decoded layout through `parseMoriPackageFileLayout`, so validation
 * and the per-record checks apply to an imported zip exactly as they
 * do to pasted JSON.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildMoriPackageFileLayout } from "./fileLayout";
import { parseMoriPackageFileLayout } from "./fileLayout";
import type { MoriPackageV0 } from "./types";

/** MIME type for a real `.mori` zip package. */
export const MORI_PACKAGE_ZIP_MIME = "application/vnd.mori.package+zip";

/**
 * Archive a `.mori v0` package into a real zip container. The zip
 * holds the canonical one-file-per-slice layout; `unzipMoriPackage`
 * reverses it.
 */
export function zipMoriPackage(pkg: MoriPackageV0): Uint8Array {
  const layout = buildMoriPackageFileLayout(pkg);
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(layout)) {
    entries[name] = strToU8(content);
  }
  return zipSync(entries);
}

/**
 * Read a real `.mori` zip package back into a validated
 * `MoriPackageV0`. Throws — via `parseMoriPackageFileLayout` — when the
 * archive is missing a required file or carries an invalid package, so
 * an imported zip is never trusted unchecked.
 */
export function unzipMoriPackage(bytes: Uint8Array): MoriPackageV0 {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    throw new Error(
      `Invalid Mori zip package: ${
        error instanceof Error ? error.message : "could not read the archive"
      }`,
    );
  }
  const layout: Record<string, string> = {};
  for (const [name, content] of Object.entries(unzipped)) {
    layout[name] = strFromU8(content);
  }
  return parseMoriPackageFileLayout(layout);
}
