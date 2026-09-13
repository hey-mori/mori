import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = join(root, "src");
const traceRoot = join(srcRoot, "lib", "trace");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function tsFiles(dir: string): string[] {
  return walk(dir).filter((file) => /\.(ts|tsx)$/.test(file));
}

type ImportRef = {
  specifier: string;
  resolved: string;
  display: string;
};

function importRefs(file: string): ImportRef[] {
  const text = readFileSync(file, "utf8");
  const refs: ImportRef[] = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? "";
    const line = text.slice(0, match.index).split(/\r?\n/).length;
    refs.push({
      specifier,
      resolved: specifier.startsWith(".")
        ? resolve(dirname(file), specifier).replace(/\\/g, "/")
        : specifier,
      display: `${relative(root, file)}:${line} -> ${specifier}`,
    });
  }
  return refs;
}

describe("trace architecture boundaries", () => {
  it("keeps trace core free of source, storage, and interpretation dependencies", () => {
    const forbidden =
      /src\/lib\/trace\/sources|src\/lib\/(record-kernel|project-memory|memory-api|analysis|capture|connectors|storage|session|import)|src\/domain/;
    const offenders = tsFiles(join(traceRoot, "core")).flatMap((file) =>
      importRefs(file)
        .filter((ref) => forbidden.test(ref.resolved))
        .map((ref) => ref.display),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps trace sources out of record, memory, capture, and analysis layers", () => {
    const forbidden =
      /src\/lib\/(record-kernel|project-memory|memory-api|analysis|capture|storage|session|import)|src\/domain/;
    const offenders = tsFiles(join(traceRoot, "sources")).flatMap((file) =>
      importRefs(file)
        .filter((ref) => forbidden.test(ref.resolved))
        .map((ref) => ref.display),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps new source consumers on trace paths instead of legacy agents paths", () => {
    const sourceFiles = tsFiles(srcRoot).filter(
      (file) => !relative(root, file).startsWith(join("src", "lib", "agents")),
    );
    const legacyAgentImport = /src\/lib\/agents(?:\/|$)|(?:^|\/)agents(?:\/|$)/;
    const offenders = sourceFiles.flatMap((file) =>
      importRefs(file)
        .filter((ref) => legacyAgentImport.test(ref.resolved))
        .map((ref) => ref.display),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps browser-specific fields out of the trace core contract", () => {
    const text = readFileSync(join(traceRoot, "core", "traceTypes.ts"), "utf8");
    const forbiddenFields = ["url", "tabId", "windowId", "profileId", "browserId", "accountId"];
    const offenders = forbiddenFields.filter((field) => new RegExp(`\\b${field}\\??:`).test(text));
    expect(offenders).toEqual([]);
  });

  it("does not introduce a generic watcher abstraction inside trace", () => {
    const offenders = tsFiles(traceRoot).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return /\b(?:interface|type|class)\s+\w*Watcher\b/.test(text) ? [relative(root, file)] : [];
    });
    expect(offenders).toEqual([]);
  });
});
