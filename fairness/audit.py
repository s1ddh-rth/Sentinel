"""Fairness gate — reads the JSON produced by ``pipelines.train`` and pass/fails against thresholds.

Designed to be called from CI:
    python fairness/audit.py --gate     # exit 1 if any threshold breached
    python fairness/audit.py            # just print the report

Thresholds come from ``domain_packs.criminal_justice.fairness`` if importable, otherwise the
defaults below (which match the values cited in CLAUDE.md / README).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

DEFAULTS = {
    "spd_abs_max": 0.10,
    "di_min": 0.80,
    "di_max": 1.25,
    "eod_abs_max": 0.10,
    "ped_abs_max": 0.10,
}


def _load_thresholds() -> dict[str, float]:
    """Pull the gate bounds from the active domain pack, falling back to the defaults.

    The pack exposes ``THRESHOLDS_BY_NAME`` (metric name → ``MetricThreshold``); we translate that
    into the flat bounds dict ``_evaluate`` consumes so the platform core stays pack-agnostic.
    """
    try:
        from domain_packs.criminal_justice import fairness  # noqa: PLC0415

        tb = getattr(fairness, "THRESHOLDS_BY_NAME", None)
        if tb:
            di_lo, di_hi = tb["DI"].bound
            return {
                "spd_abs_max": float(tb["SPD"].bound),
                "di_min": float(di_lo),
                "di_max": float(di_hi),
                "eod_abs_max": float(tb["EOD"].bound),
                "ped_abs_max": float(tb["PED"].bound),
            }
    except Exception:  # noqa: BLE001
        pass
    return DEFAULTS


def _evaluate(report: dict[str, Any], thresholds: dict[str, float]) -> list[str]:
    breaches: list[str] = []
    for attr, rep in report.items():
        if not isinstance(rep, dict) or "spd" not in rep:
            continue  # skip non-attribute entries such as the "policy" block
        spd = abs(float(rep["spd"]))
        di = float(rep["disparate_impact"])
        eod = abs(float(rep["eod"]))
        ped = abs(float(rep["ped"]))
        if spd > thresholds["spd_abs_max"]:
            breaches.append(f"{attr}: |SPD|={spd:.3f} > {thresholds['spd_abs_max']}")
        if not (thresholds["di_min"] <= di <= thresholds["di_max"]):
            breaches.append(
                f"{attr}: DI={di:.3f} outside [{thresholds['di_min']}, {thresholds['di_max']}]"
            )
        if eod > thresholds["eod_abs_max"]:
            breaches.append(f"{attr}: |EOD|={eod:.3f} > {thresholds['eod_abs_max']}")
        if ped > thresholds["ped_abs_max"]:
            breaches.append(f"{attr}: |PED|={ped:.3f} > {thresholds['ped_abs_max']}")
    return breaches


def main() -> int:
    parser = argparse.ArgumentParser(description="SENTINEL fairness gate")
    parser.add_argument("--gate", action="store_true", help="exit 1 on any threshold breach")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("models/fairness.json"),
        help="path to fairness.json produced by pipelines.train",
    )
    args = parser.parse_args()

    if not args.report.exists():
        print(f"[fairness] no report at {args.report} — has pipelines.train been run?")
        return 0 if not args.gate else 2

    report = json.loads(args.report.read_text())
    thresholds = _load_thresholds()
    print(f"[fairness] thresholds: {thresholds}")
    attrs = [a for a, r in report.items() if isinstance(r, dict) and "spd" in r]
    print(f"[fairness] groups audited: {attrs}")
    for attr in attrs:
        rep = report[attr]
        print(
            f"  {attr}: SPD={rep['spd']:+.3f}  DI={rep['disparate_impact']:.3f}  "
            f"EOD={rep['eod']:+.3f}  PED={rep['ped']:+.3f}"
        )

    breaches = _evaluate(report, thresholds)
    if breaches:
        print("\n[fairness] BREACHES:")
        for b in breaches:
            print(f"  - {b}")
        return 1 if args.gate else 0
    print("\n[fairness] all thresholds passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
