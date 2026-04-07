# evals-viewer-io

Pydantic schemas and a writer for the [evals-viewer](https://github.com/dan/evals-viewer) on-disk format.

See `docs/data-layout.md` in the monorepo for the full contract.

## Usage

```python
from evals_viewer_io import RunMetadata, EvalSummary, CaseSummary, save_eval_results

run = RunMetadata(timestamp="2026-04-07T10:30:00Z", git_commit="abc1234", tags=["baseline"])
summary = EvalSummary(
    timestamp=run.timestamp,
    aggregates={"Coverage": {"mean": 0.85, "min": 0.7, "max": 1.0}},
    cases=[
        CaseSummary(name="case_001", success=True, scores={"Coverage": 0.9}),
    ],
)
save_eval_results(
    results_dir="./test-results/evals",
    run_id="2026-04-07_103000",
    eval_name="my_eval",
    run=run,
    summary=summary,
    outputs={"case_001": {"...": "..."}},
)
```
