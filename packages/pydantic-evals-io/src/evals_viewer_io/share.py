"""Share eval runs through an object store (S3 today) via the AWS CLI.

The on-disk run directory *is* the wire format: sharing a run mirrors
``{results_dir}/{run_id}/`` to ``{remote_url}/{run_id}/``. Runs are immutable
once written, so a push never deletes and a repeated push is a no-op.

Shelling out to ``aws s3 sync`` rather than using boto3 is deliberate — it
inherits the developer's SSO session, profile resolution, multipart uploads and
parallelism for free, and keeps this package dependency-free.

Typical use from a pytest conftest::

    run_id = make_run_id(user=resolve_user())      # 20260903_101500_dan
    ...                                            # run the evals
    push_run(run_dir)                              # honours EVALS_SHARE_URL

Or after the fact, for a run you decided later was worth sharing::

    python -m evals_viewer_io.share push tests/test-results/evals/20260903_101500_dan
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

__all__ = [
    "DEFAULT_USER",
    "ShareError",
    "make_run_id",
    "push_run",
    "resolve_remote_url",
    "resolve_user",
    "share_by_default",
]

#: Env var holding the destination, e.g. ``s3://workstuff-evals-share/runs``.
REMOTE_URL_ENV = "EVALS_SHARE_URL"
#: Env var overriding the AWS profile used for sharing (falls back to the
#: ambient AWS_PROFILE / default credential chain).
PROFILE_ENV = "EVALS_SHARE_PROFILE"
#: Env var overriding the name stamped onto runs.
USER_ENV = "EVALS_USER"
#: Env var opting every run into being shared, for unattended jobs.
ALWAYS_ENV = "EVALS_SHARE_ALWAYS"

_TRUTHY = frozenset({"1", "true", "yes", "on"})

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ShareError(RuntimeError):
    """Raised when a share operation could not be completed."""


def _slug(value: str, max_length: int = 20) -> str:
    """Reduce a name to something safe in a filename, an S3 key and a URL."""
    return _SLUG_RE.sub("-", value.strip().lower()).strip("-")[:max_length]


#: Stamped on runs when no name is configured at all, so a run always carries
#: one. Which name hardly matters until runs are shared, and by then the dev has
#: set EVALS_USER.
DEFAULT_USER = "default"


def resolve_user(explicit: str | None = None) -> str:
    """Work out who is running these evals, for the ``user`` field in run.json.

    Checks the ``explicit`` argument, ``EVALS_USER``, then the shell's ``USER`` /
    ``USERNAME``, and falls back to ``DEFAULT_USER``.
    """
    for candidate in (
        explicit,
        os.getenv(USER_ENV),
        os.getenv("USER"),
        os.getenv("USERNAME"),
    ):
        if not candidate:
            continue
        slug = _slug(candidate.split("@")[0])
        if slug:
            return slug
    return DEFAULT_USER


def make_run_id(
    user: str | None = None,
    when: datetime | None = None,
    fmt: str = "%Y%m%d_%H%M%S",
) -> str:
    """Build a run id that is unique across machines, e.g. ``20260903_101500_dan``.

    A bare timestamp collides when two people start a run in the same second,
    which matters once runs from several machines land in one shared bucket.
    """
    stamp = (when or datetime.now()).strftime(fmt)
    return f"{stamp}_{user}" if user else stamp


def resolve_remote_url(explicit: str | None = None) -> str | None:
    """Destination for shared runs — the ``explicit`` argument or EVALS_SHARE_URL."""
    url = explicit or os.getenv(REMOTE_URL_ENV)
    return url.rstrip("/") if url else None


def share_by_default() -> bool:
    """Whether a finished run should be pushed without being asked.

    Off unless ``EVALS_SHARE_ALWAYS`` says otherwise. Most runs are working-out
    — a half-tuned prompt, an aborted attempt, three near-identical tries — and
    a shared store fills with those faster than anyone tidies them. Publishing
    is a decision worth making per run, once you've seen the results; the
    viewer's Share button and ``push_run`` are how it gets made. Unattended
    jobs that genuinely should publish everything set the env var.
    """
    return os.getenv(ALWAYS_ENV, "").strip().lower() in _TRUTHY


def _aws_bin() -> str:
    aws = shutil.which(os.getenv("AWS_CLI", "aws"))
    if not aws:
        raise ShareError(
            "sharing eval runs needs the AWS CLI on PATH (see "
            "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)"
        )
    return aws


def push_run(
    run_dir: str | Path,
    remote_url: str | None = None,
    *,
    profile: str | None = None,
    quiet: bool = False,
) -> str | None:
    """Mirror one run directory up to the shared store.

    Returns the remote URL the run was pushed to, or None if no destination is
    configured (sharing off — the normal case for a dev who hasn't opted in).

    Never passes ``--delete``: the shared store holds other people's runs too,
    and the local copy is only ever a subset of it.
    """
    url = resolve_remote_url(remote_url)
    if not url:
        return None

    run_dir = Path(run_dir)
    if not run_dir.is_dir():
        raise ShareError(f"run directory not found: {run_dir}")

    destination = f"{url}/{run_dir.name}/"
    cmd = [_aws_bin(), "s3", "sync", str(run_dir), destination, "--only-show-errors"]
    resolved_profile = profile or os.getenv(PROFILE_ENV)
    if resolved_profile:
        cmd += ["--profile", resolved_profile]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise ShareError(
            f"`aws s3 sync` failed pushing {run_dir.name} to {destination}\n"
            f"{result.stderr.strip() or result.stdout.strip()}"
        )

    if not quiet:
        print(f"Shared run to: {destination}")
    return destination


def _main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m evals_viewer_io.share",
        description="Share an eval run directory to the configured object store.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    push = sub.add_parser("push", help="mirror a run directory to the shared store")
    push.add_argument("run_dir", help="path to a {results_dir}/{run_id} directory")
    push.add_argument(
        "--url",
        default=None,
        help=f"destination, e.g. s3://bucket/runs (default: ${REMOTE_URL_ENV})",
    )
    push.add_argument(
        "--profile",
        default=None,
        help=f"AWS profile to push with (default: ${PROFILE_ENV}, then the usual chain)",
    )

    args = parser.parse_args(argv)
    try:
        destination = push_run(args.run_dir, args.url, profile=args.profile)
    except ShareError as exc:
        print(f"error: {exc}")
        return 1
    if destination is None:
        print(f"error: no destination — pass --url or set {REMOTE_URL_ENV}")
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_main())
