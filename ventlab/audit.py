"""Descriptive inspection only. Preserve raw strings/values on disk."""
import numpy as np
import pandas as pd

from .data import sessions, timestamps
from .protocol import CADENCE_S, EXHAUST, EXTRACT, FLOW, ML, NEAR_ZERO_LPS, OCC, ROOM, SUPPLY, TIME, UNITS


def finite_stat(series, name):
    clean = series.replace([np.inf, -np.inf], np.nan).dropna()
    return float(getattr(clean, name)()) if len(clean) else None


def audit(frame):
    t = timestamps(frame)
    dt = t.diff().dt.total_seconds()
    out = {"rows": len(frame), "time_start": str(t.min()), "time_end": str(t.max()),
           "invalid_timestamps": int(t.isna().sum()),
           "duplicate_timestamp_rows_beyond_first": int(t.dropna().duplicated().sum()),
           "reverse_steps": int((dt < 0).sum()),
           "off_cadence_steps": int((dt.notna() & dt.ne(CADENCE_S)).sum()),
           "interval_seconds_histogram": {str(k): int(v) for k, v in dt.value_counts().sort_index().items()},
           "columns": {}, "observations": {}, "sessions": []}
    for name, series in frame.items():
        entry = {"unit": UNITS.get(name, "undocumented"), "missing": int(series.isna().sum()),
                 "dtype": str(series.dtype)}
        out["columns"][name] = entry
        if name == TIME:
            entry.update(min=out["time_start"], max=out["time_end"])
            continue
        x = pd.to_numeric(series, errors="coerce")
        entry.update(min=finite_stat(x, "min"), max=finite_stat(x, "max"), median=finite_stat(x, "median"),
                     invalid_numeric=int((~np.isfinite(x) & series.notna()).sum()))
        if name in (FLOW, EXTRACT):
            q1, q3 = x.quantile([.25, .75])
            upper = q3 + 3 * (q3 - q1)
            out["observations"][name] = {"upper_outer_fence_lps": float(upper) if np.isfinite(upper) else None,
                                         "above_upper_outer_fence": int((x > upper).sum()),
                                         "negative": int((x < 0).sum()),
                                         "zero": int((x == 0).sum()),
                                         "nonnegative_at_most_1_lps": int(((x >= 0) & (x <= NEAR_ZERO_LPS)).sum())}
        if name in (ROOM, SUPPLY, EXHAUST):
            out["observations"][name] = {"nonpositive": int((x <= 0).sum())}
        if name in (OCC, ML):
            out["observations"][name] = {"outside_capacity_or_fractional": int(
                ((x < 0) | (x > 4) | (x.mod(1).ne(0) & x.notna())).sum())}
        if name == "Relative Humidity (%)":
            out["observations"][name] = {"outside_0_to_100": int(((x < 0) | (x > 100)).sum())}
    for sid, block in frame.groupby(sessions(frame), sort=False):
        first, last = block.index[[0, -1]]
        out["sessions"].append({"session": int(sid), "start": str(t.loc[first]), "end": str(t.loc[last]),
                                "first_data_row": int(first + 1), "last_data_row": int(last + 1),
                                "elapsed_minutes": None if pd.isna(t.loc[first]) else
                                (t.loc[last] - t.loc[first]).total_seconds() / 60,
                                "preceding_interval_s": float(dt.loc[first]) if pd.notna(dt.loc[first]) else None,
                                "rows": len(block), "unoccupied_rows": int(block[OCC].eq(0).sum())})
    return out
