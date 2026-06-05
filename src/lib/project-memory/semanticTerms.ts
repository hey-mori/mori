/**
 * Semantic term bridging — deterministic, local synonym / EN↔KO expansion.
 *
 * Mori's UI and questions are Korean-first, but the evidence underneath is
 * often English (code, commit messages, library names). So a question asked
 * as "인증은 어떻게 했지?" should still reach a memory titled "Auth rework",
 * and "routing 결정" should reach "라우팅 재설계". This module bridges that
 * gap at the *term* level, before retrieval, without any model or network:
 * it maps a query term to a small curated cluster of synonyms and
 * translations so the existing substring search matches paraphrased or
 * translated evidence.
 *
 * It is the deterministic floor of "semantic search" — conservative by
 * design (exact cluster membership only, capped expansion) so it adds recall
 * without flooding retrieval with noise. A future embedding-based layer can
 * sit on top as an optional, model-backed research layer
 * (`docs/mori-project-goal.md` §14 permits vectors only as an optional layer
 * over accepted memory, never the primary store).
 */

/**
 * Bidirectional clusters. Any term in a cluster expands to the others. Kept
 * lowercase to match the already-normalised retrieval terms, and deliberately
 * small / high-confidence: an over-eager alias hurts precision more than a
 * missing one hurts recall (the multi-round loop recovers misses anyway).
 */
const TERM_CLUSTERS: readonly (readonly string[])[] = [
  ["인증", "auth", "authentication", "로그인", "login"],
  ["권한", "인가", "authorization", "permission"],
  ["라우팅", "routing", "route", "라우터", "router"],
  ["데이터베이스", "database", "db"],
  ["배포", "deploy", "deployment", "release", "릴리스"],
  ["테스트", "test", "testing"],
  ["오류", "에러", "error", "버그", "bug"],
  ["성능", "performance", "perf", "최적화", "optimization"],
  ["결제", "payment", "billing", "빌링"],
  ["캐시", "cache", "caching"],
  ["보안", "security"],
  ["설정", "config", "configuration", "settings", "환경설정"],
  ["스키마", "schema", "마이그레이션", "migration"],
  ["엔드포인트", "endpoint", "api"],
  ["상태", "state", "스토어", "store"],
  ["의존성", "dependency", "dependencies", "패키지", "package"],
  ["리팩터링", "refactor", "refactoring", "리팩토링"],
];

const ALIASES: Map<string, readonly string[]> = buildAliasIndex(TERM_CLUSTERS);

function buildAliasIndex(
  clusters: readonly (readonly string[])[],
): Map<string, readonly string[]> {
  const index = new Map<string, readonly string[]>();
  for (const cluster of clusters) {
    for (const term of cluster) {
      const key = term.toLowerCase();
      // A term may sit in only one cluster; the others are its aliases.
      index.set(key, cluster.filter((other) => other.toLowerCase() !== key));
    }
  }
  return index;
}

export type ExpandSemanticTermsOptions = {
  /** Cap on the number of *added* aliases, so expansion can't blow up retrieval. */
  maxAliases?: number;
};

const DEFAULT_MAX_ALIASES = 6;

/**
 * Expand query terms with curated synonyms / translations. Returns the
 * original terms first (order preserved), then the deduped aliases, capped.
 * Unknown terms pass through untouched.
 */
export function expandSemanticTerms(
  terms: readonly string[],
  options: ExpandSemanticTermsOptions = {},
): string[] {
  const maxAliases = options.maxAliases ?? DEFAULT_MAX_ALIASES;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }

  const aliases: string[] = [];
  for (const term of terms) {
    const cluster = ALIASES.get(term.toLowerCase());
    if (!cluster) continue;
    for (const alias of cluster) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      aliases.push(alias);
      if (aliases.length >= maxAliases) {
        return [...out, ...aliases];
      }
    }
  }
  return [...out, ...aliases];
}
