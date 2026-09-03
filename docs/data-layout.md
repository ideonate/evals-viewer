# On-disk data layout

This is the public contract between eval writers (Python, see `evals-viewer-io`) and the viewer server (`@ideonate/evals-viewer-server`). Anything that produces files matching this layout can be browsed by the viewer.

## Directory tree

```
{resultsDir}/
└── {run_id}/
    ├── run.json                       (required)
    ├── tags.json                      (optional, sidecar — managed by the viewer UI)
    └── {eval_name}/
        ├── summary.json               (required)
        ├── outputs/
        │   └── {case_name}.json       (required, one per case)
        ├── inputs/
        │   └── {case_name}.json       (optional)
        └── case-scores/
            └── {case_name}.json       (optional, per-question/per-evaluator scores)
```

`run_id`, `eval_name`, and `case_name` are filesystem-safe identifiers. `run_id` is typically a timestamp (e.g. `2026-04-07_103000`).

## File schemas

### `run.json`

Run-level metadata. Tags here are "built-in" tags supplied by the writer; user-added tags live in the sidecar `tags.json`.

```json
{
  "timestamp": "2026-04-07T10:30:00Z",
  "user": "dan",
  "git_commit": "abc1234",
  "git_branch": "main",
  "git_dirty": false,
  "tags": ["baseline"]
}
```

`user` is who ran it, shown on the run in the viewer. Optional, but worth setting
once runs from several machines are pooled in a shared store — see
[Sharing runs](#sharing-runs). `evals_viewer_io.share.resolve_user()` derives it
from `EVALS_USER`, then `USER`/`USERNAME`, ignoring generic container accounts
(`root`, `node`, `vscode`, …).

### `summary.json` (per eval)

```json
{
  "timestamp": "2026-04-07T10:30:00Z",
  "aggregates": {
    "EvaluatorName": { "mean": 0.85, "min": 0.7, "max": 1.0 }
  },
  "cases": [
    {
      "name": "case_001",
      "success": true,
      "scores": { "EvaluatorName": 0.9 },
      "judge_reasons": { "EvaluatorName": "..." },
      "integrity": { "...": "..." },
      "output_summary": { "input_tokens": 1234, "output_tokens": 567, "cost_usd": 0.01 }
    },
    {
      "name": "case_002",
      "success": false,
      "error": "Timeout"
    }
  ]
}
```

`output_summary` is a free-form bag of small fields shown in the eval detail table. Recognised numeric fields like `input_tokens`/`output_tokens`/`cost_usd`/`usage_by_model` get aggregated automatically.

### `outputs/{case_name}.json`

The full case output, schema-defined by the host app. The viewer treats this opaquely except for a few well-known optional fields the standard layout displays:

- `input_tokens`, `output_tokens`, `cost_usd`
- `usage_by_model: { model_name: { input_tokens, output_tokens, cost_usd } }`

Everything else is rendered by the eval-specific inspector component (or the fallback `GenericCaseInspector`).

### `inputs/{case_name}.json` (optional)

The case input as it was at execution time. Used so that historic runs remain reproducible/inspectable even if the input fixtures evolve. Surfaced to inspectors as `caseData.caseInput`.

When this file exists it takes precedence over any `caseInput` a `caseDataLoader` supplies: the run's own record of its inputs beats a fixture read from today's working tree, which may have moved on — or, for a shared run, may not be the fixture that run used at all.

### `case-scores/{case_name}.json` (optional)

Per-question (or per-subunit) scores, e.g.:

```json
{
  "Q1": { "Coverage": 0.8, "Accuracy": 1.0 },
  "Q2": { "Coverage": 0.5 }
}
```

Surfaced to inspectors as `caseData.questionScores`.

### `tags.json` (sidecar)

A bare JSON array of strings, written by the viewer UI when users add tags. Kept separate from `run.json` so the viewer never has to mutate writer-owned files.

```json
["interesting", "regression"]
```

## API surface served by `@ideonate/evals-viewer-server`

| Method | Path                                                | Purpose                          |
| ------ | --------------------------------------------------- | -------------------------------- |
| GET    | `/api/evals`                                        | List runs and their evals        |
| GET    | `/api/evals/:runId/:evalName/summary`               | Return `summary.json`            |
| GET    | `/api/evals/:runId/:evalName/case/:caseName`        | Return composed case detail      |
| POST   | `/api/evals/:runId/tags`                            | Add a user tag                   |
| DELETE | `/api/evals/:runId/tags/:tag`                       | Remove a user tag                |
| DELETE | `/api/evals/:runId`                                 | Delete a whole run from disk     |
| POST   | `/api/evals/:runId/share`                           | Push a local run to the store    |
| GET    | `/api/remote`                                       | Shared-store status (see below)  |
| POST   | `/api/remote/refresh`                               | Force a shared-store index sync  |

The case-detail response merges data from multiple files into a single object:

```json
{
  "eval_type": "...",
  "case_name": "...",
  "output": { ... },              // outputs/{caseName}.json
  "caseInput": { ... } | null,    // inputs/{caseName}.json
  "scores": { ... } | null,       // from summary.json cases[].scores
  "integrity": { ... } | null,
  "questionScores": { ... } | null,
  "judgeReasons": { ... } | null,
  // plus any extras returned by the optional caseDataLoader hook
}
```

## Sharing runs

A team can browse each other's runs by pointing the viewer at a shared object
store (S3 today). There is no server and no database: **the shared store is a
byte-for-byte mirror of this same directory tree**, and everything the viewer
serves still comes off the local filesystem.

```
s3://bucket/runs/{run_id}/run.json
s3://bucket/runs/{run_id}/{eval_name}/summary.json
...
```

Runs are immutable once written, so a sync is always safe to repeat and
`--delete` is never passed in either direction.

**Writing** — `evals_viewer_io.share.push_run(run_dir)` mirrors one run up,
honouring `EVALS_SHARE_URL` (destination) and `EVALS_SHARE_PROFILE` (AWS
profile). The bundled `eval_run_dir` fixture calls it when the pytest session
ends. Run ids should carry the user (`make_run_id(user="dan")` →
`20260903_101500_dan`) so two people starting a run in the same second don't
collide in one bucket.

**Reading** — pass `remote` to `evalsViewerPlugin` and shared runs appear in the
list alongside local ones, at two granularities, because a single run can carry
tens of MB of rendered assets:

| When                     | What is fetched                                | Cost       |
| ------------------------ | ---------------------------------------------- | ---------- |
| `GET /api/evals`         | every run's `run.json` + `summary.json`         | kilobytes  |
| First open of a run      | that run's full tree, hydrated into `resultsDir`| once       |

Because a run is hydrated onto disk before its summary or case detail is served,
app-specific middlewares (assets, PDFs, traces) keep working unchanged. Apps that
add such middlewares should build the mirror themselves with `createRemoteMirror`
and `await mirror.hydrateRun(runId)` before serving, so deep links work too.

Runs are usually pushed by the writer as they finish, but one that was kept local
can be shared later from the UI — `POST /api/evals/:runId/share` mirrors it up.
That is refused for a run belonging to someone else: when a colleague deletes a
run they shared, everyone who saw it keeps an index-only stub of it, and pushing
that back would republish their run as a shell containing no outputs.

A run's tags sidecar is pushed back up when it is edited. Deleting a shared run
is refused unless `run.json`'s `user` matches the local user — otherwise the
delete would be undone by the next refresh, or would bin a colleague's work.

`GET /api/remote` reports `{ enabled, url, user, profile, run_count,
last_indexed_at, error }`; a store that is unreachable (expired SSO session, no
AWS CLI) degrades to local-only with the reason in `error`.

## Extending: `caseDataLoader`

`evalsViewerPlugin({ ... caseDataLoader })` accepts an async function that can inject additional fields into the case detail response. This is the seam for app-specific input loading (e.g. transcripts, assessments, personas) without forking the server. Whatever it returns is spread into the response object.
