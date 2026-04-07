import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { evalsViewerPlugin } from "@evals-viewer/server";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    evalsViewerPlugin({
      resultsDir: resolve(__dirname, "test-results/evals"),
    }),
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});
