"""Post-fit comparisons against mechanical supply only."""
from collections import Counter
import numpy as np
import pandas as pd

from .data import timestamps
from .protocol import FLOW, NEAR_ZERO_LPS, TIME, VOLUME_M3


def mechanical_reference(time_s, flow_lps):
    """Require a complete physically nonnegative window, time-weight by trapezoids."""
    t = np.asarray(time_s, dtype=float)
    q = np.asarray(flow_lps, dtype=float)
    if t.ndim != 1 or q.shape != t.shape:
        raise ValueError("reference vectors must be aligned")
    if len(t) < 2 or not np.isfinite(t).all() or np.any(np.diff(t) <= 0):
        return {"reference_status": "invalid_time_or_no_interval"}
    if not np.isfinite(q).all():
        return {"reference_status": "incomplete_flow"}
    if np.any(q < 0):
        return {"reference_status": "negative_flow", "negative_supply_samples": int((q < 0).sum())}
    mean = float(np.average((q[:-1] + q[1:]) * .5, weights=np.diff(t)))
    return {"reference_status": "near_zero" if mean <= NEAR_ZERO_LPS else "usable",
            "mean_supply_lps": mean, "reference_ach": mean * 3.6 / VOLUME_M3,
            "flow_span_lps": float(np.ptp(q))}


def score(predictions, ref_frame):
    out = []
    for pred in predictions:
        r = dict(pred)
        block = ref_frame.iloc[r["first_row"]:r["last_row"]+1]
        if (str(block[TIME].iloc[0]), str(block[TIME].iloc[-1]), len(block)) != (r["start"], r["end"], r["samples"]):
            raise ValueError("period/reference mismatch")
        ts = timestamps(block)
        seconds = (ts - ts.iloc[0]).dt.total_seconds().to_numpy()
        r.update(mechanical_reference(seconds, pd.to_numeric(block[FLOW], errors="coerce")))
        if "reference_ach" in r:
            ref = r["reference_ach"]
            for col, prefix in [("rate_ach", ""), ("baseline_ach", "baseline_")]:
                if col in r:
                    err = r[col] - ref
                    r[prefix + "signed_error_ach"] = err
                    r[prefix + "abs_error_ach"] = abs(err)
                    if r["reference_status"] == "usable":
                        r[prefix + "ape_percent"] = 100 * abs(err) / ref
            if "sensitivity_width_ach" in r:
                r["reference_inside_scenarios"] = r["sensitivity_low_ach"] <= ref <= r["sensitivity_high_ach"]
        out.append(r)
    return out


def summarize(rows):
    def values(key):
        return [r[key] for r in rows if key in r]

    def average(key):
        v = values(key)
        return float(np.mean(v)) if v else None
    inside = values("reference_inside_scenarios")
    paired = [r for r in rows if "abs_error_ach" in r and "baseline_abs_error_ach" in r]
    return {"periods": len(rows), "unoccupied": sum(r["state"] == "unoccupied" for r in rows),
            "status": dict(Counter(r["status"] for r in rows)),
            "abstention_reasons": dict(Counter(r["reason"] for r in rows if r["status"] == "abstained")),
            "flags": dict(Counter(f for r in rows for f in r["flags"])),
            "reference_status": dict(Counter(r["reference_status"] for r in rows)),
            "estimated": len(values("rate_ach")), "scored": len(values("abs_error_ach")),
            "mae_ach": average("abs_error_ach"), "mean_signed_error_ach": average("signed_error_ach"),
            "relative_n": len(values("ape_percent")), "mape_percent": average("ape_percent"),
            "sensitivity_n": len(values("sensitivity_width_ach")),
            "mean_sensitivity_width_ach": average("sensitivity_width_ach"),
            "inside_scenario_n": sum(inside), "scenario_comparable_n": len(inside),
            "inside_scenario_fraction": float(np.mean(inside)) if inside else None,
            "baseline_estimated": len(values("baseline_ach")), "baseline_scored": len(values("baseline_abs_error_ach")),
            "baseline_mae_ach": average("baseline_abs_error_ach"),
            "baseline_relative_n": len(values("baseline_ape_percent")),
            "baseline_mape_percent": average("baseline_ape_percent"),
            "paired_n": len(paired),
            "paired_physics_mae_ach": float(np.mean([r["abs_error_ach"] for r in paired])) if paired else None,
            "paired_baseline_mae_ach": float(np.mean([r["baseline_abs_error_ach"] for r in paired])) if paired else None}


def summaries(rows):
    decay = [r for r in rows if r["state"] == "unoccupied"]
    groups = {"all": rows, "unoccupied": decay, "duration_under_20_min": [r for r in decay if (r["duration_min"] or 0) < 20],
              "duration_at_least_20_min": [r for r in decay if (r["duration_min"] or 0) >= 20],
              "span_at_most_60_ppm": [r for r in decay if r.get("room_span_ppm", np.inf) <= 60],
              "span_above_60_ppm": [r for r in decay if r.get("room_span_ppm", -np.inf) > 60],
              "passes_checks": [r for r in decay if r["status"] == "passes_checks"],
              "flagged": [r for r in decay if r["status"] == "flagged"]}
    for sid in sorted({r["session"] for r in rows}):
        groups[f"session_{sid}"] = [r for r in rows if r["session"] == sid]
    return {name: summarize(group) for name, group in groups.items()}
