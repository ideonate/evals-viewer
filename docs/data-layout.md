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
  "git_commit": "abc1234",
  "git_branch": "main",
  "git_dirty": false,
  "tags": ["baseline"]
}
```

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

## Extending: `caseDataLoader`

`evalsViewerPlugin({ ... caseDataLoader })` accepts an async function that can inject additional fields into the case detail response. This is the seam for app-specific input loading (e.g. transcripts, assessments, personas) without forking the server. Whatever it returns is spread into the response object.
