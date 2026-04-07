"""Filesystem writer for the evals-viewer on-disk format."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from .schema import EvalSummary, RunMetadata


def _dump(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str))


def save_run_metadata(
    results_dir: str | Path,
    run_id: str,
    run: RunMetadata,
) -> Path:
    """Write ``{results_dir}/{run_id}/run.json`` and return its path."""
    run_dir = Path(results_dir) / run_id
    path = run_dir / "run.json"
    _dump(path, run.model_dump(mode="json", exclude_none=True))
    return path


def save_eval_results(
    results_dir: str | Path,
    run_id: str,
    eval_name: str,
    summary: EvalSummary,
    outputs: Mapping[str, Any],
    *,
    inputs: Mapping[str, Any] | None = None,
    case_scores: Mapping[str, Any] | None = None,
    run: RunMetadata | None = None,
) -> Path:
    """Write a complete eval result tree under ``{results_dir}/{run_id}/{eval_name}/``.

    If ``run`` is supplied and ``run.json`` does not yet exist, it is written too.
    """
    base = Path(results_dir) / run_id / eval_name

    _dump(base / "summary.json", summary.model_dump(mode="json", exclude_none=True))

    for case_name, output in outputs.items():
        _dump(base / "outputs" / f"{case_name}.json", output)

    if inputs:
        for case_name, value in inputs.items():
            _dump(base / "inputs" / f"{case_name}.json", value)

    if case_scores:
        for case_name, value in case_scores.items():
            _dump(base / "case-scores" / f"{case_name}.json", value)

    if run is not None:
        run_path = Path(results_dir) / run_id / "run.json"
        if not run_path.exists():
            save_run_metadata(results_dir, run_id, run)

    return base
