/**
 * Best-effort redaction for connector events before they are persisted.
 *
 * This is intentionally conservative — only obvious-looking secrets are
 * masked. Connector tools should still be careful about what they capture
 * in the first place; this is a safety net, not a security boundary.
 */

type ReplacementValue = string | ((match: string, ...groups: string[]) => string);

const PATTERNS: Array<{ name: string; regex: RegExp; replacement: ReplacementValue }> = [
  // Anthropic key MUST run before the generic OpenAI matcher; otherwise the
  // shorter "sk-" prefix swallows the longer "sk-ant-" prefix.
  {
    name: "anthropic-key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
    replacement: "[REDACTED anthropic key]",
  },
  // OpenAI-style key: sk-, sk-proj-, sk-test-, etc. The lookahead skips
  // sk-ant-* so Anthropic keys are not double-matched.
  {
    name: "openai-key",
    regex: /\bsk-(?!ant-)(?:proj-|test-|live-|admin-)?[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED openai key]",
  },
  // GitHub PAT / token: ghp_, gho_, ghu_, ghs_, ghr_, github_pat_
  {
    name: "github-pat",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED github token]",
  },
  {
    name: "github-pat-finegrained",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED github token]",
  },
  // AWS access key id
  {
    name: "aws-access-key",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED aws access key]",
  },
  // Bearer / Authorization header value (case-insensitive)
  {
    name: "bearer-token",
    regex: /\b(?:[Bb]earer|[Tt]oken)\s+[A-Za-z0-9_\-\.=]{16,}\b/g,
    replacement: "[REDACTED bearer]",
  },
  // .env-style assignment of a high-entropy value: API_KEY=xxx, SECRET=xxx
  {
    name: "env-style-secret",
    regex: /\b([A-Z][A-Z0-9_]{2,})\s*=\s*["']?[A-Za-z0-9_\-\.\/+=]{16,}["']?/g,
    replacement: (_match: string, key: string) => `${key}=[REDACTED]`,
  },
  // Slack bot/user token
  {
    name: "slack-token",
    regex: /\bxox[bopsra]-[A-Za-z0-9-]{8,}\b/g,
    replacement: "[REDACTED slack token]",
  },
  // Generic password=... pattern
  {
    name: "password-assignment",
    regex: /\b(?:password|passwd|pwd)\s*[:=]\s*\S{4,}/gi,
    replacement: "password=[REDACTED]",
  },
];

export type RedactionResult = {
  redacted: string;
  /** Names of patterns that fired at least once. */
  matchedPatterns: string[];
  /** Total number of replacements applied. */
  replacementCount: number;
};

/**
 * Apply best-effort redaction to a string. Returns the redacted string plus
 * which pattern categories fired. Caller can decide whether to flip
 * `privacy.redacted = true` on the event.
 */
export function redactText(text: string): RedactionResult {
  if (!text) return { redacted: text, matchedPatterns: [], replacementCount: 0 };
  let result = text;
  const matchedPatterns: string[] = [];
  let replacementCount = 0;

  for (const pattern of PATTERNS) {
    let local = 0;
    const fn = pattern.replacement;
    result = result.replace(pattern.regex, (match: string, ...rest: unknown[]) => {
      local += 1;
      if (typeof fn === "function") {
        const groups = rest.filter((value): value is string => typeof value === "string");
        return fn(match, ...groups);
      }
      return fn;
    });
    if (local > 0) {
      matchedPatterns.push(pattern.name);
      replacementCount += local;
    }
  }

  return { redacted: result, matchedPatterns, replacementCount };
}

/**
 * Returns true if `text` contains anything that looks like a secret. Used
 * by the validator to flag events for review rather than auto-redact.
 */
export function containsLikelySecret(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some((pattern) => {
    // Reset stateful regex.
    pattern.regex.lastIndex = 0;
    return pattern.regex.test(text);
  });
}
