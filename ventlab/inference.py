"""Reference-blind period-level inference and provisional reliability checks."""
import numpy as np
import pandas as pd

from .data import periods, timestamps
from .physics import fit_rate, log_decay
from .protocol import (ASSUMED_BG_SHIFT, BACKGROUND, MIN_FIT_MIN, MAX_RATE, OCC,
                       ROOM_ACCURACY, ROOM, SHORT_MIN, SUPPLY, TIME)


def numeric(block, col):
    return pd.to_numeric(block[col], errors="coerce").to_numpy(dtype=float)


def at_bound(rate):
    return min(rate, MAX_RATE - rate) < 1e-6


def characterize(t, room, supply, measured):
    flags = []
    span = float(np.ptp(room))
    duration = float(t[-1] / 60)
    r = {"room_span_ppm": span, "room_drop_ppm": float(room[0] - room[-1]),
         "initial_excess_ppm": float(room[0] - supply[0])}
    if duration < SHORT_MIN:
        flags.append("short_duration")
    if span <= 2 * ROOM_ACCURACY:
        flags.append("low_variation")
    if not measured:
        flags.append("assumed_background")
    b_err = 40 + .03 * supply if measured else np.full(len(t), ASSUMED_BG_SHIFT)
    if np.max(np.abs(room - supply) - (ROOM_ACCURACY + b_err)) <= 0:
        flags.append("weak_room_supply_contrast")
    if r["room_drop_ppm"] <= 0:
        flags.append("no_net_decay")
    if duration < MIN_FIT_MIN:
        return dict(r, status="abstained", reason="under_minimum_duration", flags=flags,
                    baseline_status="under_minimum_duration")

    mean_b = float(np.average(supply[:-1], weights=np.diff(t)))
    try:
        r.update(baseline_ach=log_decay(t, room, mean_b), baseline_status="estimated")
    except ValueError as err:
        r["baseline_status"] = str(err)

    try:
        rate, rmse = fit_rate(t, room, supply)
    except ValueError as err:
        return dict(r, status="abstained", reason=str(err), flags=flags)
    r.update(rate_ach=rate, rmse_ppm=rmse, scenario_rates={"nominal": rate})
    if len(t) == 2:
        flags.append("insufficient_residual_information")
    if at_bound(rate):
        flags.append("nominal_rate_at_bound")
    if rate * t[-1] / 3600 < .25:
        flags.append("short_relative_to_time_constant")
    if rmse > ROOM_ACCURACY:
        flags.append("large_fit_residual")

    # Coherent calibration offsets and two endpoint-drift stress cases, one window at a time.
    for sign_c in (-1, 1):
        for sign_b in (-1, 1):
            name = f"room{sign_c:+d}_supply{sign_b:+d}"
            try:
                k, _ = fit_rate(t, room + sign_c * ROOM_ACCURACY, supply + sign_b * b_err)
                r["scenario_rates"][name] = k
            except ValueError:
                r["scenario_rates"][name] = None
        drift = sign_c * ROOM_ACCURACY * (2 * t / t[-1] - 1)
        try:
            k, _ = fit_rate(t, room + drift, supply)
            r["scenario_rates"][f"room_drift{sign_c:+d}"] = k
        except ValueError:
            r["scenario_rates"][f"room_drift{sign_c:+d}"] = None
    rates = list(r["scenario_rates"].values())
    if any(k is None for k in rates):
        flags.append("incomplete_sensitivity")
    else:
        lo, hi = min(rates), max(rates)
        r.update(sensitivity_low_ach=lo, sensitivity_high_ach=hi, sensitivity_width_ach=hi-lo)
        if hi-lo > max(1., .5 * rate):
            flags.append("parameter_sensitive")
        if any(at_bound(k) for k in rates):
            flags.append("scenario_at_bound")

    mid = int(np.searchsorted(t, .5 * t[-1]))
    halves = [slice(None, mid+1), slice(mid, None)]
    if all(np.ptp(t[h]) >= MIN_FIT_MIN * 60 and np.ptp(room[h]) > 2 * ROOM_ACCURACY for h in halves):
        try:
            k1, k2 = [fit_rate(t[h], room[h], supply[h])[0] for h in halves]
            r.update(first_half_ach=k1, second_half_ach=k2, rate_change_check="assessed")
            if abs(k1-k2) > max(1., .5*rate):
                flags.append("possible_rate_change")
        except ValueError:
            r["rate_change_check"] = "indeterminate"
    else:
        r["rate_change_check"] = "insufficient_half_window_signal_or_duration"
    return dict(r, flags=flags, status="flagged" if flags else "passes_checks", reason="")


def infer_periods(frame):
    """Only declared sensor inputs can reach window construction and fitting."""
    measured = SUPPLY in frame
    frame = frame[[TIME, OCC, ROOM] + ([SUPPLY] if measured else [])]
    output = []
    for session, state, block in periods(frame):
        times = timestamps(block)
        t = (times - times.iloc[0]).dt.total_seconds().to_numpy()
        r = {"session": session, "state": state, "first_row": int(block.index[0]),
             "last_row": int(block.index[-1]), "start": block[TIME].iloc[0],
             "end": block[TIME].iloc[-1], "samples": len(t), "duration_min": float(t[-1]/60)
             if np.isfinite(t).all() else None, "background": "duct" if measured else "assumed"}
        if state != "unoccupied":
            r.update(status="abstained", reason="unknown_generation", flags=[state + "_occupancy", "unknown_generation"],
                     baseline_status="unknown_generation")
        else:
            c = numeric(block, ROOM)
            b = numeric(block, SUPPLY) if measured else np.full(len(t), BACKGROUND)
            if not np.isfinite(t).all() or not np.isfinite(c).all() or not np.isfinite(b).all() or min(c.min(), b.min()) <= 0:
                r.update(status="abstained", reason="invalid_measurements", flags=["invalid_measurements"],
                         baseline_status="invalid_measurements")
            else:
                r.update(characterize(t, c, b, measured))
        output.append(r)
    return output
