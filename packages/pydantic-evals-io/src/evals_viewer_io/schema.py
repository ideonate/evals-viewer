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


class TokenUsage(_Permissive):
    """Token usage and cost for one model call, one case, or a whole eval.

    Field names follow the Anthropic / viewer convention (input/output rather
    than request/response). Adapter classmethods like ``from_pydantic_ai``
    rename other frameworks' fields onto these.

    Cost is the caller's responsibility — pricing tables go stale fast and
    don't belong in this package.

    The ``usage_by_model`` map is one level deep: entries inside it should
    leave their own ``usage_by_model`` as None.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float | None = None
    usage_by_model: dict[str, "TokenUsage"] | None = None

    def __add__(self, other: TokenUsage) -> TokenUsage:
        if not isinstance(other, TokenUsage):
            return NotImplemented

        # Sum cost only if at least one side reports it; preserve None when
        # nobody knows the cost.
        if self.cost_usd is None and other.cost_usd is None:
            cost = None
        else:
            cost = (self.cost_usd or 0.0) + (other.cost_usd or 0.0)

        # Merge per-model breakdowns. Only one level deep — don't recurse.
        merged: dict[str, TokenUsage] | None
        if self.usage_by_model is None and other.usage_by_model is None:
            merged = None
        else:
            merged = {}
            for source in (self.usage_by_model or {}, other.usage_by_model or {}):
                for model, usage in source.items():
                    if model in merged:
                        merged[model] = TokenUsage(
                            input_tokens=merged[model].input_tokens + usage.input_tokens,
                            output_tokens=merged[model].output_tokens + usage.output_tokens,
                            cost_usd=_sum_optional(merged[model].cost_usd, usage.cost_usd),
                        )
                    else:
                        merged[model] = TokenUsage(
                            input_tokens=usage.input_tokens,
                            output_tokens=usage.output_tokens,
                            cost_usd=usage.cost_usd,
                        )

        return TokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cost_usd=cost,
            usage_by_model=merged,
        )

    def __radd__(self, other: Any) -> TokenUsage:
        # Lets `sum([usage1, usage2, ...])` work without an explicit start value.
        if other == 0:
            return self
        return NotImplemented

    @classmethod
    def from_pydantic_ai(cls, usage: Any, *, cost_usd: float | None = None) -> TokenUsage:
        """Build a TokenUsage from a pydantic-ai Usage or RunUsage object.

        Maps ``request_tokens`` → ``input_tokens`` and ``response_tokens`` →
        ``output_tokens``. Tolerates None values (treats them as zero).
        Cost is not derived from tokens — pass it in if you have it.

        Uses ``getattr`` so this package never imports pydantic-ai itself.
        """
        return cls(
            input_tokens=getattr(usage, "request_tokens", 0) or 0,
            output_tokens=getattr(usage, "response_tokens", 0) or 0,
            cost_usd=cost_usd,
        )


def _sum_optional(a: float | None, b: float | None) -> float | None:
    if a is None and b is None:
        return None
    return (a or 0.0) + (b or 0.0)


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
    #: Who ran it. Shown on the run in the viewer, which matters once runs from
    #: several machines are pooled in one shared store. See
    #: ``evals_viewer_io.share.resolve_user``.
    user: str | None = None
    git_commit: str | None = None
    git_branch: str | None = None
    git_dirty: bool = False
    tags: list[str] = Field(default_factory=list)
