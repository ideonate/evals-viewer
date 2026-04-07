import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { evalsViewerPlugin } from "@ideonate/evals-viewer-server";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    evalsViewerPlugin({
      resultsDir: resolve(__dirname, "test-results/evals"),
    }),
  ],
  // @ideonate/evals-viewer-core ships raw .vue source. Vite's dep pre-bundler
  // tries to inline the whole package (including its own copy of vue-router)
  // into one chunk, which then runs alongside the project-root vue-router —
  // two router instances, useRouter() returns undefined, router.push fails.
  // Excluding from optimizeDeps forces Vite to serve the .vue files through
  // @vitejs/plugin-vue at request time, sharing one vue-router instance.
  // dedupe is belt-and-braces against any further dual-package hazards.
  optimizeDeps: {
    exclude: ["@ideonate/evals-viewer-core"],
  },
  resolve: {
    dedupe: ["vue", "vue-router"],
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});
