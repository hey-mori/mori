#!/usr/bin/env node
// Bundle the offline backfill dry run (#148) into one Node file with Vite, the
// bundler the repository already declares. The bundle is a build artifact: it
// stays out of Git, and it records the commit it was built from.
//
//   node scripts/build-backfill-dry-run.mjs  ->  tools-dist/mori-backfill-dry-run.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;

await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  define: {
    __MORI_TOOL_COMMIT__: JSON.stringify(commit),
    __MORI_TOOL_DIRTY__: JSON.stringify(dirty),
  },
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "src/tools/backfill-dry-run/cli.ts",
    outDir: "tools-dist",
    emptyOutDir: true,
    minify: false,
    target: "node22",
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "mori-backfill-dry-run.mjs",
      },
    },
  },
});
// Provenance first in the file, so `head -1` answers "built from what".
const out = new URL("../tools-dist/mori-backfill-dry-run.mjs", import.meta.url);
const banner = `// mori-backfill-dry-run · built from ${commit}${dirty ? " (dirty working tree)" : ""}\n`;
writeFileSync(out, banner + readFileSync(out, "utf8"));
process.stdout.write(`built tools-dist/mori-backfill-dry-run.mjs from ${commit}${dirty ? " (dirty)" : ""}\n`);
