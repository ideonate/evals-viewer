# @ideonate/evals-viewer-server

Vite plugin and middleware exposing the filesystem-backed [**evals-viewer**](https://github.com/ideonate/evals-viewer) API. Pair with [`@ideonate/evals-viewer-core`](https://www.npmjs.com/package/@ideonate/evals-viewer-core) for the Vue 3 frontend.

## Install

```sh
npm install @ideonate/evals-viewer-server
```

## Quickstart

```js
// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { evalsViewerPlugin } from "@ideonate/evals-viewer-server";

export default defineConfig({
  plugins: [
    vue(),
    evalsViewerPlugin({
      resultsDir: resolve(__dirname, "tests/test-results/evals"),
    }),
  ],
});
```

That's it. The plugin serves the eval results JSON tree under `/api/evals/*` while the Vue app at `/` (built with `@ideonate/evals-viewer-core`) consumes it.

## On-disk contract

The plugin reads files in this layout:

```
{resultsDir}/{run_id}/
├── run.json                       (timestamp, git_commit, tags)
└── {eval_name}/
    ├── summary.json               (aggregates + per-case scores)
    └── outputs/
        └── {case_name}.json       (full per-case output)
```

Plus optional `inputs/`, `case-scores/`, and a sidecar `tags.json`. See [`docs/data-layout.md`](https://github.com/ideonate/evals-viewer/blob/main/docs/data-layout.md) for the full schema.

The Python [`evals-viewer-io`](https://github.com/ideonate/evals-viewer/tree/main/packages/pydantic-evals-io) package writes this layout from your test suite.

## Loader helpers

Need to attach extra fields to the case-detail response (e.g. assessments, transcripts, persona files)? Compose a `caseDataLoader` from the included building blocks:

```js
import {
  evalsViewerPlugin,
  resolveResultsDir,
  composeLoaders,
  staticCaseInputLoader,
  datasetCaseLoader,
} from "@ideonate/evals-viewer-server";

evalsViewerPlugin({
  resultsDir: resolveResultsDir({
    envVar: "TEST_RESULTS_FOLDER",
    fallback: "./tests/test-results/evals",
  }),
  evalsDir: "./tests/evals",
  caseDataLoader: composeLoaders(
    staticCaseInputLoader(),
    datasetCaseLoader({
      files: {
        assessment: "assessment.json",
        transcript: "transcripts/{person}.json",
      },
    }),
  ),
});
```

| Helper | Purpose |
| --- | --- |
| `resolveResultsDir({ envVar, fallback })` | Resolve a path from an env var with a fallback |
| `composeLoaders(...loaders)` | Chain multiple async loaders, shallow-merging results |
| `staticCaseInputLoader()` | Loads `{evalsDir}/{eval}/data/cases/{case}.json` as `caseInput` |
| `datasetCaseLoader({ files })` | Parses `{dataset}_{person}` case names and loads per-dataset files (templates support `{dataset}` and `{person}` interpolation) |

You can also write a custom loader from scratch — it's just an async function `({ evalName, caseName, evalDir, evalsDir }) => extras`.

## API surface served

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/evals` | List runs and their evals |
| GET | `/api/evals/:runId/:evalName/summary` | Return `summary.json` |
| GET | `/api/evals/:runId/:evalName/case/:caseName` | Composed case detail |
| POST | `/api/evals/:runId/tags` | Add a user tag |
| DELETE | `/api/evals/:runId/tags/:tag` | Remove a user tag |
| DELETE | `/api/evals/:runId` | Delete a whole run from disk |

## Lower-level usage

If you don't want the Vite plugin wrapper, use `createEvalsApiMiddleware` directly with any Connect-compatible server:

```js
import { createEvalsApiMiddleware } from "@ideonate/evals-viewer-server";

const middleware = createEvalsApiMiddleware({ resultsDir: "..." });
app.use(middleware);
```

## License

MIT

## Serving referenced media (`serveFiles`)

Eval outputs often point at media on disk — persisted browser-session videos, screenshots,
audio clips — that the inspectors render. The plugin can serve those with HTTP Range
support (so `<video>` seeking works), path-sandboxed to each mount's root:

```js
evalsViewerPlugin({
  resultsDir,
  serveFiles: [{ prefix: "/api/take-files/", dir: resultsDir }],
})
```

`serveFiles` takes one mount or an array; `prefix` defaults to `/api/files/`. Mounts are
registered **before** the API middleware — that middleware answers (and 404s) every
`/api/*` URL, so a file route registered after it would never be reached; using
`serveFiles` instead of a hand-rolled sibling middleware avoids that ordering footgun.
The underlying factory is exported as `createStaticFilesMiddleware({ dir })` for
hand-mounting elsewhere.
