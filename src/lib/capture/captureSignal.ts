/**
 * Capture content-signal · decides whether a raw capture is worth a ledger
 * record at all. Machine noise (a bare shell command, agent tool-run markers,
 * a lone file path or code block) is retained as a source but should NOT become
 * a record, or the ledger fills with garbage the user never meant to keep.
 *
 * The retention invariant is untouched: the pipeline always keeps the raw
 * source (architecture §16.4). This only stops a low-signal capture from also
 * minting a record. Deliberately CONSERVATIVE · when unsure it returns "keep",
 * because dropping a real note is worse than keeping a weak one. It never
 * inspects who wrote the text, only what the text is.
 */

export type LowSignalReason =
  | "command" // a shell command / CLI invocation
  | "tool-noise" // agent tool-run markers (🔧 · ↳ 도구 결과)
  | "path" // a bare file-system path
  | "code" // a lone fenced code block
  | "too-short"; // nothing to hold on to

export type CaptureSignal =
  | { signal: "keep" }
  | { signal: "low"; reason: LowSignalReason };

const HANGUL_RE = /[가-힣]/;
const URL_LEADING_RE = /^https?:\/\//i;

/** A Windows path prompt like `C:\dev\mori>` or `PS C:\dev\mori> npm ...`.
 *  Unambiguous · a real note never carries a `C:\…>` prompt, so it drops at any
 *  capture length. */
const WINDOWS_PROMPT_RE = /^(?:ps\s+)?[a-z]:\\[^\n]*>\s*/i;
/** A weak shell prompt · `$ `, `# `, `> `. These collide with prose (a dollar
 *  amount, a Markdown heading or quote), so a match only STRIPS the prefix; the
 *  remainder must still read as a command for the line to count as one. */
const WEAK_PROMPT_RE = /^[$>#]\s+/;

/** Leading tokens that essentially never open English or Korean prose, so a
 *  line that starts with one is a command on the token alone. */
const UNAMBIGUOUS_COMMANDS = new Set([
  "npm", "npx", "pnpm", "deno", "git", "docker", "docker-compose", "podman",
  "kubectl", "terraform", "gcloud", "wget", "ssh", "scp", "rsync", "chmod",
  "chown", "sudo", "apt", "apt-get", "yum", "dnf", "pacman", "systemctl",
  "cmake", "tsc", "vite", "webpack", "eslint", "vitest", "pytest", "mypy",
  "ruff", "flake8", "gofmt", "javac", "mvn", "gradle", "dotnet", "rustc",
  "rustup", "ipconfig", "ifconfig", "netstat", "mkdir", "rmdir", "whoami",
  "ls", "pwd", "cls", "rm", "mv", "cp", "cd", "vim", "nvim", "nano", "python3",
]);

/** Tokens that are also plausible English / name words · a command only when
 *  the line carries a command argument (flag · path · pipe) OR a known
 *  subcommand, so "make a plan", "claude nailed it", "brew tastes better",
 *  "poetry reading", and "cargo was delayed" all stay notes. */
const AMBIGUOUS_COMMANDS = new Set([
  "make", "set", "go", "find", "type", "clear", "cat", "echo", "copy", "move",
  "del", "dir", "where", "which", "run", "source", "export", "service", "kill",
  "touch", "ping", "code", "grep", "rg", "sed", "awk", "tar", "zip", "unzip",
  "node", "python", "py", "ruby", "php", "java", "aws", "az", "su", "snap",
  "yarn", "cargo", "bun", "pip", "pip3", "poetry", "gem", "composer", "helm",
  "curl", "brew", "prettier", "jest", "claude", "black",
]);

/** A command argument: a flag, a shell operator, or a path-shaped token. */
const COMMAND_ARG_RE = /(?:^|\s)(?:-{1,2}[a-z]|[a-z]:[\\/]|[./~][\w./\\-]*|&&|\|\|?|[;<>])/i;

/** Second-token subcommands that make an ambiguous first token a command
 *  ("cargo build", "brew install", "gem update") without needing a flag. */
const KNOWN_SUBCOMMANDS = new Set([
  "build", "run", "test", "check", "install", "add", "remove", "uninstall",
  "update", "upgrade", "publish", "start", "dev", "lint", "format", "exec",
  "init", "new", "status", "commit", "push", "pull", "clone", "fetch", "merge",
  "rebase", "up", "down", "logs", "compose", "restart", "deploy",
]);

/** Mori's own import labels · a user never types these, so they are machine
 *  noise wherever they appear. The wrench emoji is language-neutral and handled
 *  separately (noise only on a non-Korean line). */
const ARROW_TOOL_MARKERS = ["↳ 도구 결과", "↳ 도구 오류", "↳ 도구"];

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function looksLikeKnownCommand(line: string): boolean {
  const tokens = line.split(/\s+/);
  const firstToken = tokens[0]?.toLowerCase().replace(/\.exe$/, "") ?? "";
  if (UNAMBIGUOUS_COMMANDS.has(firstToken)) return true;
  if (AMBIGUOUS_COMMANDS.has(firstToken)) {
    // A command argument (flag · path · pipe) or a known dev subcommand promotes
    // an ambiguous word to a command; bare prose ("gem of a book") does not.
    const secondToken = tokens[1]?.toLowerCase() ?? "";
    return (
      COMMAND_ARG_RE.test(line.slice(firstToken.length)) || KNOWN_SUBCOMMANDS.has(secondToken)
    );
  }
  return false;
}

/** A command line, optionally behind a weak `$`/`#`/`>` shell prompt. */
function looksLikeCommandLine(line: string): boolean {
  if (WINDOWS_PROMPT_RE.test(line)) return true;
  const stripped = line.replace(WEAK_PROMPT_RE, "");
  if (HANGUL_RE.test(stripped)) return false;
  return looksLikeKnownCommand(stripped);
}

/** A capture that is agent tool-run noise, not something the user typed. */
function isToolNoise(text: string): boolean {
  const lines = nonEmptyLines(text);
  if (lines.length === 0) return false;
  const first = lines[0];
  // Mori's own import labels · unambiguous machine noise wherever they appear.
  if (ARROW_TOOL_MARKERS.some((marker) => first.startsWith(marker))) return true;
  if (lines.some((line) => ARROW_TOOL_MARKERS.some((marker) => line.includes(marker)))) {
    return true;
  }
  // The wrench emoji is language-neutral · noise only when the line is a tool
  // invocation (no Korean prose after it), so "🔧 수도꼭지 고쳤다" stays a note.
  return first.startsWith("🔧") && !HANGUL_RE.test(first);
}

/** A lone fenced code block · ```…``` with nothing else around it. */
function isLoneCodeBlock(text: string): boolean {
  return text.startsWith("```") && text.endsWith("```") && text.length > 6;
}

/** The whole capture is a single filesystem path · a drive path, a multi-segment
 *  path, or a one-segment path with a file extension. Kept tight so a note like
 *  "and/or" or "N/A" (one separator, no extension) is never misread. */
function isBarePath(text: string): boolean {
  if (/\s/.test(text) || HANGUL_RE.test(text)) return false;
  if (URL_LEADING_RE.test(text)) return false; // a URL is a meaningful pointer
  if (/^[a-z]:[\\/]/i.test(text)) return true; // C:\… or C:/…
  const separators = (text.match(/[\\/]/g) ?? []).length;
  if (separators === 0) return false;
  if (!/^[.~]?[\w.\-]+(?:[\\/][\w.\-]+)+$/.test(text)) return false;
  const hasExtension = /\.[a-z0-9]{1,6}$/i.test(text);
  return separators >= 2 || hasExtension;
}

/**
 * Classify a raw capture's content signal. Runs only meaningful, specific
 * heuristics; anything it is not confident about stays "keep".
 */
export function classifyCaptureSignal(text: string): CaptureSignal {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { signal: "low", reason: "too-short" };
  // A URL is a faithful pointer (kept as a source-document), never low-signal.
  if (URL_LEADING_RE.test(trimmed)) return { signal: "keep" };
  if (isToolNoise(trimmed)) return { signal: "low", reason: "tool-noise" };
  if (isLoneCodeBlock(trimmed)) return { signal: "low", reason: "code" };
  if (isBarePath(trimmed)) return { signal: "low", reason: "path" };

  const lines = nonEmptyLines(trimmed);
  const firstLine = lines[0] ?? "";
  // A Windows path prompt is unambiguous · drop at any capture length.
  if (WINDOWS_PROMPT_RE.test(firstLine)) return { signal: "low", reason: "command" };
  // A bare command line (optionally behind a $/#/> prompt) · only for a short
  // capture with no Korean anywhere, so prose that merely opens with #, >, or a
  // command word (a heading, a quote, "make a plan") is never misread.
  if (lines.length <= 3 && !HANGUL_RE.test(trimmed) && looksLikeCommandLine(firstLine)) {
    return { signal: "low", reason: "command" };
  }
  return { signal: "keep" };
}

/** Convenience predicate · true when a capture should be kept as source only. */
export function isLowSignalText(text: string): boolean {
  return classifyCaptureSignal(text).signal === "low";
}

/** Plain-Korean reason for why a capture was kept as source only · used in the
 *  composer's "원문만 보관" state. No internal vocabulary. */
export function lowSignalReasonLabel(reason: LowSignalReason): string {
  switch (reason) {
    case "command":
      return "명령어처럼 보여서";
    case "tool-noise":
      return "도구 실행 기록처럼 보여서";
    case "path":
      return "파일 경로처럼 보여서";
    case "code":
      return "코드 조각처럼 보여서";
    case "too-short":
      return "내용이 너무 짧아서";
  }
}
