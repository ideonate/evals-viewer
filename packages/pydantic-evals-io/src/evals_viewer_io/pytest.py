"""Optional pytest fixture helpers for evals-viewer-io.

Apps can write their own fixtures, but this provides a sensible default:

    # conftest.py
    from evals_viewer_io.pytest import eval_run_dir  # noqa: F401
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pytest

from .schema import RunMetadata
from .writer import save_run_metadata


def _now_run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")


@pytest.fixture(scope="session")
def eval_run_dir(tmp_path_factory) -> Path:
    """Create a fresh run directory for the test session and return its path.

    Honours ``EVALS_RESULTS_DIR`` if set, otherwise uses a tmp dir. Writes a
    minimal ``run.json`` so the viewer will list it.
    """
    base = Path(os.environ.get("EVALS_RESULTS_DIR", tmp_path_factory.mktemp("evals")))
    run_id = _now_run_id()
    save_run_metadata(
        base,
        run_id,
        RunMetadata(timestamp=datetime.now(timezone.utc).isoformat()),
    )
    return base / run_id
