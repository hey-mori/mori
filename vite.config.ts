import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => ({
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
}));
