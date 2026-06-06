"""Fairness configuration for the criminal-justice pack.

Defines protected attributes, the metrics audited, and the thresholds that gate model promotion.
Thresholds are deliberately strict — a breach blocks CI (see .github/workflows/fairness-gate.yml).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PROTECTED_ATTRIBUTES: list[str] = ["Race", "Gender"]
PRIMARY_PROTECTED_ATTRIBUTE: str = "Race"


@dataclass(frozen=True)
class MetricThreshold:
    """A fairness metric and the rule its value must satisfy to pass."""

    name: str
    full_name: str
    direction: Literal["abs", "range"]
    # For "abs": |value| < bound. For "range": low <= value <= high.
    bound: float | tuple[float, float]

    def passes(self, value: float) -> bool:
        if self.direction == "abs":
            assert isinstance(self.bound, (int, float))
            return abs(value) < float(self.bound)
        lo, hi = self.bound  # type: ignore[misc]
        return lo <= value <= hi


THRESHOLDS: list[MetricThreshold] = [
    MetricThreshold("SPD", "Statistical Parity Difference", "abs", 0.10),
    MetricThreshold("DI", "Disparate Impact", "range", (0.80, 1.25)),
    MetricThreshold("EOD", "Equal Opportunity Difference", "abs", 0.10),
    MetricThreshold("PED", "Predictive Equality Difference", "abs", 0.10),
]

THRESHOLDS_BY_NAME: dict[str, MetricThreshold] = {t.name: t for t in THRESHOLDS}
