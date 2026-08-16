import { createEvalsApiMiddleware } from "./api.js";
import { createStaticFilesMiddleware, normalizeServeFiles } from "./files.js";

export { createEvalsApiMiddleware };
export { createStaticFilesMiddleware } from "./files.js";
export {
  composeLoaders,
  datasetCaseLoader,
  resolveResultsDir,
  staticCaseInputLoader,
} from "./loaders.js";

/**
 * Vite plugin wrapping the evals API middleware.
 *
 *   import { evalsViewerPlugin } from "@ideonate/evals-viewer-server";
 *
 *   export default defineConfig({
 *     plugins: [
 *       vue(),
 *       evalsViewerPlugin({
 *         resultsDir: "./test-results/evals",
 *         evalsDir: "./tests/evals",      // optional
 *         caseDataLoader: async ({ evalName, caseName, evalsDir }) => ({...}),
 *         // optional: Range-supporting static mounts for media the results
 *         // reference (videos, snapshots). Registered BEFORE the API middleware,
 *         // which otherwise claims every /api/* URL.
 *         serveFiles: [{ prefix: "/api/take-files/", dir: "./test-results/evals" }],
 *       }),
 *     ],
 *   });
 */
export function evalsViewerPlugin(options) {
  const middleware = createEvalsApiMiddleware(options);
  const fileMounts = normalizeServeFiles(options.serveFiles);
  const attach = (server) => {
    // File mounts first: the API middleware handles (and 404s) every /api/* URL,
    // so anything registered after it under /api/ would never be reached.
    for (const { prefix, dir } of fileMounts) {
      server.middlewares.use(prefix, createStaticFilesMiddleware({ dir }));
    }
    server.middlewares.use(middleware);
  };
  return {
    name: "evals-viewer-server",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
