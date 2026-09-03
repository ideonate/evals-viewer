"""Optional pytest fixture helpers for evals-viewer-io.

Apps can write their own fixtures, but this provides a sensible default:

    # conftest.py
    from evals_viewer_io.pytest import eval_run_dir  # noqa: F401

The run directory is stamped with the user who ran it and, if a shared store is
configured (``EVALS_SHARE_URL``), pushed there when the session finishes.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pytest

from .schema import RunMetadata
from .share import ShareError, make_run_id, push_run, resolve_user
from .writer import save_run_metadata


@pytest.fixture(scope="session")
def eval_run_dir(tmp_path_factory) -> Path:
    """Create a fresh run directory for the test session and return its path.

    Honours ``EVALS_RESULTS_DIR`` if set, otherwise uses a tmp dir. Writes a
    minimal ``run.json`` so the viewer will list it, then shares the finished
    run if ``EVALS_SHARE_URL`` is set.
    """
    base = Path(os.environ.get("EVALS_RESULTS_DIR", tmp_path_factory.mktemp("evals")))
    user = resolve_user()
    run_id = make_run_id(user=user, when=datetime.now(timezone.utc), fmt="%Y-%m-%d_%H%M%S")
    save_run_metadata(
        base,
        run_id,
        RunMetadata(timestamp=datetime.now(timezone.utc).isoformat(), user=user),
    )
    run_dir = base / run_id

    yield run_dir

    # Sharing is best-effort: a run that is already on disk shouldn't be
    # reported as a test failure because the network or a token was missing.
    try:
        push_run(run_dir)
    except ShareError as exc:
        print(f"[evals-viewer] could not share run {run_id}: {exc}")
