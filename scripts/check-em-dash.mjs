#!/usr/bin/env node
/**
 * The em dash guard.
 *
 * `CLAUDE.md` calls the ban non-negotiable, and nothing enforced it: the rule
 * was swept by hand once and grew back, and the rules file itself carried two
 * violations in its own headings. A rule with no gate is a preference.
 *
 * Scope is deliberately narrower than the rule. The rule covers UI strings and
 * code comments too, but `src/` currently holds about 1,600 occurrences across
 * 411 files, so gating on it would fail every run and teach everyone to skip
 * the gate. This covers prose, where the repo is already clean, so the guard
 * starts green and stays green. Widening it to `src/` needs that sweep first
 * and is tracked separately.
 *
 * The one legitimate use is a line that names the banned character, which the
 * rule and its restatements have to do. Those write it inside backticks, so
 * that is the exemption: a code span containing only the character itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const EM_DASH = "\u2014";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
/** Prose only. See the scope note above. */
const ROOTS = ["docs", "."];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "target", "assets"]);

function markdownFiles(dir, recurse) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (recurse) out.push(...markdownFiles(full, true));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** A line is exempt only when every em dash on it sits inside a code span. */
function isExempt(line) {
  return line.replace(/`[^`]*`/g, "").indexOf(EM_DASH) === -1;
}

const files = [
  ...markdownFiles(join(ROOT, "docs"), true),
  ...markdownFiles(ROOT, false),
];

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.includes(EM_DASH) || isExempt(line)) return;
    violations.push(`${relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error(`em dash guard: ${violations.length} violation(s).`);
  console.error("Use a comma, a middle dot, or split the sentence. See CLAUDE.md.");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(`em dash guard: ${files.length} prose file(s) clean`);
