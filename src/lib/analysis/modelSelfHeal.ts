/**
 * Model self-heal · repair a configured model name that is no longer installed.
 *
 * The failure this exists for: the engine picker stores a model name, the user
 * later removes or renames that model, and every run afterwards fails with
 * "모델을 찾을 수 없습니다" even though the server is running and other models
 * are installed. The settings screen showed the error but repaired nothing, so
 * a working setup looked broken until someone hand-picked a replacement.
 *
 * Rules, and why:
 *  - Never override a model that IS installed. A user who deliberately chose a
 *    smaller model must not be silently upgraded.
 *  - Never invent a model when nothing is installed. There is nothing to pick,
 *    and guessing a name would replace a clear error with a confusing one.
 *  - Prefer the same family. Someone on `qwen2.5:3b` whose install now only has
 *    `qwen2.5:7b` wants that, not an unrelated model that happens to sort first.
 *  - Always report that a change happened. A silent switch to a different model
 *    would make answers change for reasons the user cannot see.
 */

export type ModelHealResult = {
  /** The model to use. Unchanged unless a repair was both needed and possible. */
  model: string;
  /** Whether this differs from what was configured. */
  changed: boolean;
  reason: "already-installed" | "nothing-installed" | "same-family" | "first-available";
};

/**
 * The family part of a model tag: everything before the first `:`, which is
 * where Ollama puts the size or quantisation. `qwen2.5:3b` → `qwen2.5`.
 */
export function modelFamily(model: string): string {
  const trimmed = model.trim().toLowerCase();
  const separator = trimmed.indexOf(":");
  return separator === -1 ? trimmed : trimmed.slice(0, separator);
}

/** Choose a usable model given what is actually installed. */
export function pickUsableModel(
  configured: string,
  installed: readonly string[],
): ModelHealResult {
  const wanted = configured.trim();
  const available = installed.map((name) => name.trim()).filter(Boolean);

  // Exact match wins, case-insensitively: Ollama tags are lower-case in
  // practice but a hand-typed name may not be.
  const exact = available.find((name) => name.toLowerCase() === wanted.toLowerCase());
  if (exact) {
    // Returned as the installed spelling, so a case-only difference stops
    // being re-healed on every probe.
    return { model: exact, changed: exact !== configured, reason: "already-installed" };
  }

  if (available.length === 0) {
    // Nothing to switch to. Keeping the configured name preserves the honest
    // "this model is missing" error instead of hiding it behind an empty field.
    return { model: configured, changed: false, reason: "nothing-installed" };
  }

  if (wanted) {
    const family = modelFamily(wanted);
    const sameFamily = available.find((name) => modelFamily(name) === family);
    if (sameFamily) {
      return { model: sameFamily, changed: true, reason: "same-family" };
    }
  }

  return { model: available[0], changed: true, reason: "first-available" };
}

/** Korean sentence describing a repair, for the settings surface. Returns null
 *  when nothing changed, so the caller shows no note rather than an empty one. */
export function describeModelHeal(result: ModelHealResult, previous: string): string | null {
  if (!result.changed) return null;
  const from = previous.trim();
  return from
    ? `${from}이(가) 설치되어 있지 않아 ${result.model}로 바꿨습니다.`
    : `설치된 모델 ${result.model}을(를) 선택했습니다.`;
}
