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

## Sharing runs with your team

Point the viewer at a shared object store and your colleagues' runs appear in the
list next to your own, each badged with who ran it:

```js
evalsViewerPlugin({
  resultsDir: RESULTS_DIR,
  remote: process.env.EVALS_SHARE_URL, // "s3://your-bucket/runs"
});
```

There is no server and no database — the store is a byte-for-byte mirror of the
same directory tree, synced with the AWS CLI (which means the developer's
existing SSO session and profile just work). Every run's `run.json` +
`summary.json` are pulled on the list page; a run's full tree is hydrated onto
disk the first time it is opened, so nothing else in the viewer needs to know S3
exists.

If your app adds its own middlewares (assets, PDFs, traces), build the mirror
yourself and hydrate before serving so deep links work too:

```js
import { createRemoteMirror, evalsViewerPlugin } from "@ideonate/evals-viewer-server";

const mirror = process.env.EVALS_SHARE_URL
  ? createRemoteMirror({ url: process.env.EVALS_SHARE_URL, resultsDir: RESULTS_DIR })
  : null;

// inside your middleware, before touching the filesystem:
if (mirror) await mirror.hydrateRun(runId);

evalsViewerPlugin({ resultsDir: RESULTS_DIR, remote: mirror });
```

A run that was kept local can be shared later with the "Share" button on the run
list (`POST /api/evals/:runId/share`), and retracted again with "Unshare"
(`DELETE` on the same path), which removes it from the store but keeps your copy.
Runs are otherwise pushed up by the writer side — see
[`evals-viewer-io`](https://pypi.org/project/evals-viewer-io/)'s `push_run()`.
`EVALS_SHARE_PROFILE` picks the AWS profile; `GET /api/remote` reports status and
why the store is unreachable if it is.

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

Eval outputs often point at media on disk — session recordings, screenshots, audio
clips — that the inspectors render. The plugin can serve those with HTTP Range support
(so `<video>` seeking works), path-sandboxed to each mount's root:

```js
evalsViewerPlugin({
  resultsDir,
  serveFiles: [{ prefix: "/api/media/", dir: resultsDir }],
})
```

`serveFiles` takes one mount or an array; `prefix` defaults to `/api/files/`. Mounts are
registered **before** the API middleware — that middleware answers (and 404s) every
`/api/*` URL, so a file route registered after it would never be reached; using
`serveFiles` instead of a hand-rolled sibling middleware avoids that ordering footgun.
The underlying factory is exported as `createStaticFilesMiddleware({ dir })` for
hand-mounting elsewhere.
