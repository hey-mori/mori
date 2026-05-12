import type { MoriPackageV0 } from "./types";
import { validateMoriPackage } from "./validation";

export function deserializeMoriPackage(serialized: string): MoriPackageV0 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Invalid Mori package JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  const validation = validateMoriPackage(parsed);
  if (!validation.valid) {
    const messages = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Mori package: ${messages}`);
  }

  return parsed;
}

export function importMoriPackageFromJson(serialized: string): MoriPackageV0 {
  return deserializeMoriPackage(serialized);
}
