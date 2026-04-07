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
  // Force a single instance of vue and vue-router. @ideonate/evals-viewer-core
  // ships raw .vue source, so without dedupe Vite can resolve "vue-router"
  // from inside node_modules differently than from this project root, ending
  // up with two router instances and a useRouter() that returns undefined.
  resolve: {
    dedupe: ["vue", "vue-router"],
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});
