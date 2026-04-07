"""Pydantic schemas and writer for the evals-viewer on-disk format."""

from .aggregates import compute_aggregates, compute_token_totals
from .schema import (
    AggregateStats,
    CaseSummary,
    EvalSummary,
    RunMetadata,
    TokenUsage,
)
from .writer import save_eval_results, save_run_metadata

__all__ = [
    "AggregateStats",
    "CaseSummary",
    "EvalSummary",
    "RunMetadata",
    "TokenUsage",
    "compute_aggregates",
    "compute_token_totals",
    "save_eval_results",
    "save_run_metadata",
]
