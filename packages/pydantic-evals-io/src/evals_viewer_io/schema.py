"""Pydantic models matching the evals-viewer on-disk format.

See ``docs/data-layout.md`` in the monorepo for the canonical contract.
These models are intentionally permissive (extra fields allowed) so writers
can include domain-specific extras without coordinating schema bumps.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Permissive(BaseModel):
    model_config = ConfigDict(extra="allow")


class AggregateStats(_Permissive):
    """Aggregate stats for one evaluator across all cases in an eval."""

    mean: float
    min: float
    max: float


class CaseSummary(_Permissive):
    """One row in ``summary.json``'s ``cases`` array."""

    name: str
    success: bool = True
    error: str | None = None
    scores: dict[str, float] | None = None
    judge_reasons: dict[str, str] | None = None
    integrity: dict[str, Any] | None = None
    output_summary: dict[str, Any] | None = None


class EvalSummary(_Permissive):
    """Contents of ``summary.json`` for one eval inside one run."""

    timestamp: str | None = None
    aggregates: dict[str, AggregateStats] = Field(default_factory=dict)
    cases: list[CaseSummary] = Field(default_factory=list)


class RunMetadata(_Permissive):
    """Contents of ``run.json`` at the run-id directory root."""

    timestamp: str
    git_commit: str | None = None
    git_branch: str | None = None
    git_dirty: bool = False
    tags: list[str] = Field(default_factory=list)
