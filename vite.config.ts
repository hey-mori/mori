import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

const REPO = fileURLToPath(new URL(".", import.meta.url));

// Tests are discovered from this repository only. A `--root` elsewhere makes
// Vitest glob the whole filesystem before any filename filter applies (how a
// `--root /` run once took a shared machine down). scripts/run-tests.mjs
// refuses it; this refuses it for anyone who calls Vitest directly with this
// config.
// Vitest's parser accepts `--root`, `-r`, `--r=`, and `r` inside a short cluster
// (`-ur=/`), so every spelling is checked.
const rootValue = (() => {
  const argv = process.argv;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-") || arg === "--") continue;
    const body = arg.replace(/^-+/, "");
    const head = body.split("=")[0];
    const isRoot = arg.startsWith("--") ? head === "root" || head === "r" : head.includes("r");
    if (isRoot)
      return body.includes("=") ? body.slice(body.indexOf("=") + 1) : (argv[index + 1] ?? "");
  }
  return null;
})();
if (rootValue !== null && (!rootValue || resolve(rootValue) !== resolve(REPO))) {
  throw new Error(`Mori runs from its repository (${REPO}); --root ${rootValue} is not allowed.`);
}

export default defineConfig(({ mode }) => ({
  // Honour a PORT override (the preview/verify harness assigns a free port via
  // this env var) while leaving the normal Tauri dev flow on the default 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    mode === "analyze"
      ? visualizer({
          filename: "dist/bundle-stats.html",
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : null,
  ].filter(Boolean),
  test: {
    // Every test file lives under src/; discovery is pinned there so a stray
    // filter never widens it. The worker cap matches scripts/run-tests.mjs,
    // which passes it explicitly; it is here too so a direct `vitest run` on
    // this shared machine is bounded the same way.
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    maxWorkers: Number(process.env.MORI_TEST_MAX_WORKERS) || 2,
    // Two pools, because two kinds of test live here.
    //
    // Almost everything is a pure derivation and parallelises happily. A handful
    // of connector smoke tests are different in kind: they spawn real `bash`,
    // `python3` and `git` processes, dozens per file. Measured alone the slowest
    // takes ~10s against a 60s budget, but in the shared pool they land on
    // workers already contending for CPU and disk (and, on a dev machine, with a
    // `cargo` build), and blow the budget. That produced an intermittently red
    // suite, which teaches people to ignore red.
    //
    // Serialising the process-spawning group is the fix, rather than raising
    // their timeouts again: the previous round already did that, and a bigger
    // number only lengthens how long a genuinely hung test takes to report.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: ["**/node_modules/**", "**/dist/**", "src/lib/connectors/*Smoke.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "smoke",
          include: ["src/lib/connectors/*Smoke.test.ts"],
          fileParallelism: false,
          // Measured, after serialising was not enough on its own: these four
          // files take ~230s to run alone on a loaded machine, about 29s per
          // test, because each spawns real bash, python3 and git processes.
          // Against that, the previous 60s budget was barely 2x headroom and
          // still lost whenever the unit project ran alongside.
          //
          // An earlier round of this argued that raising the timeout only hides
          // the problem. That was wrong here: these tests do not hang, they are
          // genuinely slow, and a budget calibrated on an idle machine is not a
          // budget. Serialising the group is still what stops them competing
          // with each other; this is what stops a loaded machine failing them.
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
}));
