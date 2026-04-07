import { createEvalsApiMiddleware } from "./api.js";

export { createEvalsApiMiddleware };
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
 *       }),
 *     ],
 *   });
 */
export function evalsViewerPlugin(options) {
  const middleware = createEvalsApiMiddleware(options);
  return {
    name: "evals-viewer-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
