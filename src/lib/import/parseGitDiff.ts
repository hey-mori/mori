export type GitDiffChangeType = "added" | "modified" | "deleted" | "renamed";

export type GitDiffFile = {
  path: string;
  previousPath?: string;
  changeType: GitDiffChangeType;
  additions: number;
  deletions: number;
  language: string | null;
  hunks: number;
};

export type GitDiffParseResult = {
  files: GitDiffFile[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
  };
};

const DIFF_HEADER = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?\s*$/;
const HUNK_HEADER = /^@@\s/;

/**
 * Parses unified `git diff` output into a structured summary. The parser is
 * intentionally tolerant: unknown lines are skipped rather than throwing, and
 * partial diffs still produce as much structure as they can. Use this together
 * with `isLikelyGitDiff` for input validation.
 */
export function parseGitDiff(input: string): GitDiffParseResult {
  const lines = input.split(/\r?\n/);
  const files: GitDiffFile[] = [];
  let current: GitDiffFile | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headerMatch = DIFF_HEADER.exec(line);
    if (headerMatch) {
      if (current) files.push(current);
      const aPath = headerMatch[1];
      const bPath = headerMatch[2];
      const path = bPath || aPath;
      current = {
        path,
        previousPath: aPath !== bPath ? aPath : undefined,
        changeType: "modified",
        additions: 0,
        deletions: 0,
        language: inferLanguageFromPath(path),
        hunks: 0,
      };
      continue;
    }

    if (current === null) continue;

    if (line.startsWith("new file mode")) {
      current.changeType = "added";
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.changeType = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.previousPath = line.slice("rename from ".length).trim();
      current.changeType = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length).trim();
      current.language = inferLanguageFromPath(current.path);
      current.changeType = "renamed";
      continue;
    }
    if (HUNK_HEADER.test(line)) {
      current.hunks += 1;
      continue;
    }
    // Skip metadata lines.
    if (
      line.startsWith("index ") ||
      line.startsWith("similarity index") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("Binary files")
    ) {
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      continue;
    }
  }

  if (current) files.push(current);

  const totals = files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );

  return { files, totals };
}

/**
 * Returns true when the input looks like a real unified diff. Used to reject
 * pasted prose before normalization.
 */
export function isLikelyGitDiff(input: string): boolean {
  if (!input.trim()) return false;
  return /^\s*diff --git\s/m.test(input) || /^@@\s.+@@/m.test(input);
}

export function inferLanguageFromPath(path: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  const table: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    rs: "rust",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    css: "css",
    scss: "css",
    html: "html",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    xml: "xml",
  };
  return table[ext] ?? null;
}

export function categorizeFile(path: string): "code" | "test" | "docs" | "config" | "other" {
  if (/(^|\/)(__tests__|test|tests|spec|specs)\//i.test(path) || /\.test\.|\.spec\./i.test(path)) {
    return "test";
  }
  if (/\.(md|mdx|rst|txt|adoc)$/i.test(path)) return "docs";
  if (/\.(json|toml|yml|yaml|ini|cfg|conf|env|lock)$/i.test(path)) return "config";
  if (/\.(ts|tsx|js|jsx|mjs|cjs|rs|py|rb|go|java|kt|swift|c|h|cpp|cc|hpp|cs|php|sql|sh|css|scss|html)$/i.test(path)) {
    return "code";
  }
  return "other";
}
