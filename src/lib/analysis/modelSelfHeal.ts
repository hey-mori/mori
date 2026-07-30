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
 *  - Never pick an embedding model. They cannot generate text at all, so
 *    selecting one turns a missing-model error into a confusing failure on every
 *    run. Ollama lists them alongside chat models with no type flag.
 *  - Prefer the smaller model when nothing else decides. The first repair here
 *    picked a large model and the very next run timed out; between two models we
 *    know nothing else about, the one that answers is better than the one that
 *    is theoretically stronger.
 *  - Always report that a change happened. A silent switch to a different model
 *    would make answers change for reasons the user cannot see.
 */

/** What an installed model looks like. A bare name is accepted because not
 *  every probe reports details. */
export type InstalledModel = {
  name: string;
  /** On-disk size in bytes, when the probe reported it. */
  sizeBytes?: number;
  /** Human parameter count such as "8.2B", when the probe reported it. */
  parameterSize?: string;
};

export type ModelHealResult = {
  /** The model to use. Unchanged unless a repair was both needed and possible. */
  model: string;
  /** Whether this differs from what was configured. */
  changed: boolean;
  reason:
    | "already-installed"
    | "nothing-installed"
    | "same-family"
    /** Chosen because it is the smallest model that can generate text. */
    | "smallest-available";
};

/**
 * Names that identify an embedding model.
 *
 * Matched on the name because Ollama's tag list carries no model type. Erring
 * toward exclusion is right: wrongly skipping a chat model costs one manual
 * pick, wrongly selecting an embedding model breaks every run silently.
 */
const EMBEDDING_MARKERS = [
  "embed",
  "bge-",
  "gte-",
  "e5-",
  "all-minilm",
  "mxbai-embed",
  "snowflake-arctic-embed",
];

/** Whether a model can only produce vectors, never text. */
export function isEmbeddingModel(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return EMBEDDING_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Parameter count in billions, parsed from what the probe reported or, failing
 * that, from the tag. `qwen2.5:7b` → 7, `gemma3:270m` → 0.27.
 */
export function parameterBillions(model: InstalledModel): number | undefined {
  const source = model.parameterSize ?? model.name;
  const match = /(\d+(?:\.\d+)?)\s*([bm])/i.exec(source);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return match[2].toLowerCase() === "m" ? value / 1000 : value;
}

/** Order two models cheapest-first, using whatever the probe actually told us. */
function bySmallest(a: InstalledModel, b: InstalledModel): number {
  const aParams = parameterBillions(a);
  const bParams = parameterBillions(b);
  if (aParams !== undefined && bParams !== undefined && aParams !== bParams) {
    return aParams - bParams;
  }
  if (a.sizeBytes !== undefined && b.sizeBytes !== undefined && a.sizeBytes !== b.sizeBytes) {
    return a.sizeBytes - b.sizeBytes;
  }
  // Nothing to compare on: keep the order the probe returned, so the choice is
  // at least stable across runs.
  return 0;
}

function normalize(entry: string | InstalledModel): InstalledModel {
  return typeof entry === "string" ? { name: entry.trim() } : { ...entry, name: entry.name.trim() };
}

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
  installed: readonly (string | InstalledModel)[],
): ModelHealResult {
  const wanted = configured.trim();
  const all = installed.map(normalize).filter((model) => model.name);

  // Exact match wins, case-insensitively: Ollama tags are lower-case in
  // practice but a hand-typed name may not be. Checked against EVERY installed
  // model, including embedding ones: if the user deliberately typed one, that
  // is their choice to see fail, not ours to silently override.
  const exact = all.find((model) => model.name.toLowerCase() === wanted.toLowerCase());
  if (exact) {
    // Returned as the installed spelling, so a case-only difference stops
    // being re-healed on every probe.
    return {
      model: exact.name,
      changed: exact.name !== configured,
      reason: "already-installed",
    };
  }

  // Only text-capable models are candidates for an AUTOMATIC choice.
  const usable = all.filter((model) => !isEmbeddingModel(model.name));

  if (usable.length === 0) {
    // Nothing we can pick. Keeping the configured name preserves the honest
    // "this model is missing" error instead of hiding it behind an empty field,
    // and is also correct when the only installs are embedding models.
    return { model: configured, changed: false, reason: "nothing-installed" };
  }

  if (wanted) {
    const family = modelFamily(wanted);
    const sameFamily = usable
      .filter((model) => modelFamily(model.name) === family)
      .sort(bySmallest)[0];
    if (sameFamily) {
      return { model: sameFamily.name, changed: true, reason: "same-family" };
    }
  }

  // Smallest rather than first: the model that answers beats the model that is
  // theoretically stronger but times out.
  const smallest = [...usable].sort(bySmallest)[0];
  return { model: smallest.name, changed: true, reason: "smallest-available" };
}

/**
 * A meaningfully smaller installed model than the one configured, or null.
 *
 * Separate from `pickUsableModel` on purpose. The heal repairs a model that is
 * MISSING; this handles a model that is present and merely too slow, which must
 * never be switched automatically: the user chose it, and quietly downgrading
 * someone to a weaker model to win a timeout is the wrong trade to make on
 * their behalf. The caller offers it as a button.
 *
 * "Meaningfully" is a third smaller, so a 7b does not suggest a 6b.
 */
export function suggestSmallerModel(
  configured: string,
  installed: readonly (string | InstalledModel)[],
): string | null {
  const all = installed.map(normalize).filter((model) => model.name);
  const current = all.find(
    (model) => model.name.toLowerCase() === configured.trim().toLowerCase(),
  );
  if (!current) return null;

  const currentSize = parameterBillions(current);
  const candidates = all
    .filter((model) => model.name !== current.name && !isEmbeddingModel(model.name))
    .filter((model) => {
      const size = parameterBillions(model);
      if (currentSize !== undefined && size !== undefined) return size <= currentSize * 0.67;
      if (current.sizeBytes !== undefined && model.sizeBytes !== undefined) {
        return model.sizeBytes <= current.sizeBytes * 0.67;
      }
      // Nothing comparable: suggesting a change we cannot justify would be noise.
      return false;
    })
    .sort(bySmallest);

  return candidates[0]?.name ?? null;
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
