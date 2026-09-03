# evals-viewer-io

Pydantic schemas and a writer for the [**evals-viewer**](https://github.com/ideonate/evals-viewer) on-disk format. This is the Python writer side of the framework — it produces the JSON tree that [`@ideonate/evals-viewer-server`](https://www.npmjs.com/package/@ideonate/evals-viewer-server) reads and the Vue frontend [`@ideonate/evals-viewer-core`](https://www.npmjs.com/package/@ideonate/evals-viewer-core) renders.

## Install

```sh
pip install evals-viewer-io
```

Requires Python 3.10+ and Pydantic 2.

## What's in the box

| Symbol | Purpose |
| --- | --- |
| `RunMetadata`, `EvalSummary`, `CaseSummary`, `AggregateStats` | Pydantic models matching the on-disk format |
| `TokenUsage` | Token / cost model with addition, `from_pydantic_ai` adapter, per-model breakdown |
| `save_run_metadata`, `save_eval_results` | Filesystem writers — given models and dicts, write JSON in the layout the viewer expects |
| `compute_aggregates(cases)` | Group `case.scores[evaluator]` across cases → `{evaluator: {mean, min, max}}` |
| `compute_token_totals(cases)` | Sum token usage / cost / per-model breakdown across cases |
| `eval_run_dir` (pytest fixture) | Optional fixture creating a fresh run directory under `EVALS_RESULTS_DIR`, then sharing it |
| `resolve_user`, `make_run_id`, `push_run` | Stamp runs with who ran them and mirror them to a shared store |

## Quickstart: minimal end-to-end

```python
from evals_viewer_io import (
    RunMetadata, EvalSummary, CaseSummary, TokenUsage,
    compute_aggregates, compute_token_totals,
    save_eval_results,
)

# 1. Build per-case rows. The output_summary dict is a free-form bag of
#    fields the viewer can show in the eval-detail table; token fields
#    use the canonical input_tokens / output_tokens / cost_usd / usage_by_model.
cases = [
    CaseSummary(
        name="case_001",
        scores={"Accuracy": 0.9, "Coverage": 0.8},
        judge_reasons={"Accuracy": "All key facts present."},
        output_summary={
            "input_tokens": 1234,
            "output_tokens": 567,
            "cost_usd": 0.012,
        },
    ),
    CaseSummary(
        name="case_002",
        scores={"Accuracy": 0.7, "Coverage": 0.9},
        output_summary={"input_tokens": 980, "output_tokens": 440, "cost_usd": 0.009},
    ),
    CaseSummary(name="case_003", success=False, error="Timeout"),
]

# 2. Compute the per-eval aggregates and write the run.
summary = EvalSummary(
    timestamp="2026-04-07T10:30:00Z",
    aggregates=compute_aggregates(cases),
    cases=cases,
)

save_eval_results(
    results_dir="./tests/test-results/evals",
    run_id="2026-04-07_103000",
    eval_name="my_eval",
    summary=summary,
    outputs={
        "case_001": {"answer": "...", "input_tokens": 1234, "output_tokens": 567, "cost_usd": 0.012},
        "case_002": {"answer": "...", "input_tokens": 980, "output_tokens": 440, "cost_usd": 0.009},
    },
    run=RunMetadata(timestamp="2026-04-07T10:30:00Z", git_commit="abc1234"),
)
```

That writes:

```
tests/test-results/evals/2026-04-07_103000/
├── run.json
└── my_eval/
    ├── summary.json
    └── outputs/
        ├── case_001.json
        └── case_002.json
```

Open the viewer and the run shows up.

## Token usage

`TokenUsage` is a normal Pydantic model with `__add__` so you can sum across cases or across model calls:

```python
from evals_viewer_io import TokenUsage

opus_call = TokenUsage(input_tokens=1200, output_tokens=300, cost_usd=0.018)
haiku_call = TokenUsage(input_tokens=800, output_tokens=200, cost_usd=0.0009)

# Per-model breakdown for one case
case_total = TokenUsage(
    input_tokens=opus_call.input_tokens + haiku_call.input_tokens,
    output_tokens=opus_call.output_tokens + haiku_call.output_tokens,
    cost_usd=(opus_call.cost_usd or 0) + (haiku_call.cost_usd or 0),
    usage_by_model={"opus": opus_call, "haiku": haiku_call},
)

# Or just use sum() across multiple cases:
total = sum([case1_usage, case2_usage, case3_usage])
```

The viewer reads `input_tokens`, `output_tokens`, `cost_usd`, and `usage_by_model` from both each case's full output JSON and from the per-case row in `summary.json`'s `output_summary`.

### Pydantic-AI adapter

If you use [pydantic-ai](https://ai.pydantic.dev), there's a one-liner to convert its `Usage` / `RunUsage` objects (which use `request_tokens` / `response_tokens` rather than `input` / `output`):

```python
from evals_viewer_io import TokenUsage

usage = TokenUsage.from_pydantic_ai(result.usage(), cost_usd=my_cost_calc(result))
```

The adapter uses `getattr` so this package never imports pydantic-ai itself. Other frameworks (OpenAI SDK, Anthropic SDK, …) can be mapped just as easily — `TokenUsage(input_tokens=resp.usage.prompt_tokens, output_tokens=resp.usage.completion_tokens)` etc.

Cost is the caller's responsibility. Pricing tables go stale fast and don't belong in this package.

## Aggregating tokens across cases

```python
from evals_viewer_io import compute_token_totals

totals = compute_token_totals(cases)
print(totals.input_tokens, totals.output_tokens, totals.cost_usd)
print(totals.usage_by_model)  # per-model breakdown summed across all cases
```

The function reads `input_tokens` / `output_tokens` / `cost_usd` / `usage_by_model` from each case's `output_summary`. Cases that don't have those fields contribute zero.

## pytest fixture

```python
# tests/conftest.py
from evals_viewer_io.pytest import eval_run_dir  # noqa: F401
```

```python
# tests/test_my_eval.py
def test_my_eval(eval_run_dir):
    # eval_run_dir is a pathlib.Path under EVALS_RESULTS_DIR (or a tmp dir),
    # and run.json has already been written.
    ...
    save_eval_results(
        results_dir=eval_run_dir.parent,
        run_id=eval_run_dir.name,
        eval_name="my_eval",
        summary=summary,
        outputs=outputs,
    )
```

Set `EVALS_RESULTS_DIR=tests/test-results/evals` (or wherever your project keeps them) so the run lands somewhere the viewer can find.

## Sharing runs with your team

A run directory is self-contained, so sharing one is just a mirror to an object
store (S3 today, via the AWS CLI — which inherits the developer's existing SSO
session and profile):

```python
from evals_viewer_io import make_run_id, push_run, resolve_user

user = resolve_user()                    # EVALS_USER, else USER/USERNAME, else "default"
run_id = make_run_id(user=user)          # 20260903_101500_dan
...                                      # write the run as usual
push_run(run_dir)                        # honours EVALS_SHARE_URL
```

**Sharing is opt-in per run.** `push_run` only runs when you call it, and the
bundled `eval_run_dir` fixture doesn't call it unless `EVALS_SHARE_ALWAYS` is
set. Most runs are working-out — a half-tuned prompt, an aborted attempt, three
near-identical tries — and a shared store fills with those faster than anyone
tidies them. Publish the ones worth a colleague's attention, once you've seen
the results.

| Env var | Purpose |
| --- | --- |
| `EVALS_SHARE_URL` | Destination, e.g. `s3://your-bucket/runs`. Unset = sharing off, and `push_run` is a no-op returning None. |
| `EVALS_SHARE_PROFILE` | AWS profile to push with (default: the ambient credential chain). |
| `EVALS_USER` | Name stamped onto runs. Needed wherever the shell user is generic — in a container everyone is `node`, so runs land as `default` without it. |
| `EVALS_SHARE_ALWAYS` | Push every finished run without being asked. For unattended jobs — a nightly eval that should always publish. Off by default. |

Put the user in the run id: a bare timestamp collides when two people start a run
in the same second, which starts to matter once several machines write into one
bucket. Push never passes `--delete` — the shared store holds other people's runs
too. To share a run after the fact:

```sh
python -m evals_viewer_io.share push tests/test-results/evals/20260903_101500_dan
```

The reading side is [`@ideonate/evals-viewer-server`](https://www.npmjs.com/package/@ideonate/evals-viewer-server)'s `remote` option, which pulls each run's index files for the list page and hydrates a full run on first open.

## What this package deliberately does *not* do

This is intentionally a small package — schemas plus the smallest set of helpers that every consumer would need to write themselves. It does **not** include:

- **Token field extraction from arbitrary model outputs.** Different LLM SDKs name fields differently; the caller knows their own output schema.
- **A pricing table.** Costs are pricing × tokens; pricing changes weekly. You compute it, you pass it in via `cost_usd`.
- **Pydantic→dict serialization.** If your case output is a Pydantic model, call `.model_dump()` yourself before passing it to `save_eval_results`. Hiding that behind a wrapper would just suppress errors.
- **Coupling to a specific eval framework** like `pydantic-evals` or `inspect_ai`. The writer takes plain dicts. Frameworks can be added as adapters when there's demand.
- **Schema versioning.** The on-disk format is forward-compatible by design (`extra="allow"` everywhere). If a breaking change ever lands, that's the time for a `schema_version` field, not now.

## On-disk contract

See [`docs/data-layout.md`](https://github.com/ideonate/evals-viewer/blob/main/docs/data-layout.md) in the monorepo for the full directory tree and per-file schemas. The TL;DR:

```
{results_dir}/{run_id}/
├── run.json                       (RunMetadata)
└── {eval_name}/
    ├── summary.json               (EvalSummary: aggregates + per-case rows)
    ├── outputs/{case_name}.json   (full per-case output)
    ├── inputs/{case_name}.json    (optional; saved input fixture)
    └── case-scores/{case_name}.json (optional; per-question scores)
```

## License

MIT
