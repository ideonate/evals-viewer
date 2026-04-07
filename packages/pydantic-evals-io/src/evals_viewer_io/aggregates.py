"""Helpers for computing per-eval aggregates from a list of cases.

These are deliberately small and unambiguous: any consumer with multiple
cases per eval will need them, and the math has no domain knowledge.
Anything fancier (token cost tables, framework-specific extraction) lives
in caller code, not here.
"""

from __future__ import annotations

from typing import Any, Iterable

from .schema import AggregateStats, CaseSummary, TokenUsage


def compute_aggregates(cases: Iterable[CaseSummary]) -> dict[str, AggregateStats]:
    """Group ``case.scores[evaluator]`` across cases and return mean/min/max.

    Failed cases (``success=False``) and cases with no scores are skipped.
    Evaluators are listed in first-seen order across the input.
    """
    grouped: dict[str, list[float]] = {}
    for case in cases:
        if case.success is False or not case.scores:
            continue
        for evaluator, value in case.scores.items():
            if value is None:
                continue
            grouped.setdefault(evaluator, []).append(float(value))

    return {
        evaluator: AggregateStats(
            mean=sum(values) / len(values),
            min=min(values),
            max=max(values),
        )
        for evaluator, values in grouped.items()
        if values
    }


def compute_token_totals(cases: Iterable[CaseSummary]) -> TokenUsage:
    """Sum token usage across cases.

    Reads ``input_tokens``, ``output_tokens``, ``cost_usd``, and
    ``usage_by_model`` from each case's ``output_summary``. Cases without
    those fields contribute zero. The returned ``TokenUsage.usage_by_model``
    is the per-model breakdown summed across all cases that had one.
    """
    total = TokenUsage()
    for case in cases:
        summary = case.output_summary or {}
        contribution = _token_usage_from_dict(summary)
        if contribution is not None:
            total = total + contribution
    return total


def _token_usage_from_dict(d: dict[str, Any]) -> TokenUsage | None:
    """Best-effort extraction from a free-form output_summary dict."""
    if not any(k in d for k in ("input_tokens", "output_tokens", "cost_usd", "usage_by_model")):
        return None

    raw_by_model = d.get("usage_by_model")
    by_model: dict[str, TokenUsage] | None
    if raw_by_model:
        by_model = {}
        for model, usage in raw_by_model.items():
            if isinstance(usage, TokenUsage):
                entry = usage
            elif isinstance(usage, dict):
                entry = TokenUsage(
                    input_tokens=int(usage.get("input_tokens", 0) or 0),
                    output_tokens=int(usage.get("output_tokens", 0) or 0),
                    cost_usd=usage.get("cost_usd"),
                )
            else:
                continue
            by_model[model] = entry
    else:
        by_model = None

    return TokenUsage(
        input_tokens=int(d.get("input_tokens", 0) or 0),
        output_tokens=int(d.get("output_tokens", 0) or 0),
        cost_usd=d.get("cost_usd"),
        usage_by_model=by_model,
    )
