"""Single-zone CO2 balance. Public time axes are elapsed seconds, rates are h^-1."""
import math
import numpy as np
from scipy.optimize import minimize_scalar

from .protocol import MAX_RATE


def _axis(time_s):
    t = np.asarray(time_s, dtype=float)
    if t.ndim != 1 or t.size < 2 or not np.isfinite(t).all():
        raise ValueError("need at least two finite timestamps")
    dt = np.diff(t) / 3600.0
    if not np.isfinite(dt).all() or np.any(dt <= 0):
        raise ValueError("times must increase strictly")
    return dt


def _series(values, n, name, *, scalar=True, strictly_positive=False):
    a = np.asarray(values, dtype=float)
    if a.ndim == 0 and scalar:
        a = np.full(n, a.item())
    if a.shape != (n,) or not np.isfinite(a).all():
        raise ValueError(f"invalid shape or nonfinite {name}")
    if np.any(a < 0) or (strictly_positive and np.any(a == 0)):
        raise ValueError(f"invalid {name}")
    return a


def _trajectory(dt, c0, supply, rate, generation):
    # Hold supply and generation at the left endpoint of each interval.
    exposure = rate * dt
    w = -np.expm1(-exposure)
    integrated = dt.copy()
    # For subnormal exposures, w/rate may underflow before the division.
    large = exposure > 1e-8
    integrated[large] = w[large] / rate
    integrated[~large] *= 1.0 - .5 * exposure[~large]
    source_step = generation[:-1] * integrated
    out = np.empty(len(supply))
    out[0] = c0
    for i, (mix, source) in enumerate(zip(w, source_step)):
        c = out[i]
        out[i + 1] = c + mix * (supply[i] - c) + source
    return out


def simulate(time_s, initial_ppm, supply_ppm, rate_ach, generation_ppm_h=0.0):
    """Propagate C with prescribed nonnegative generation per unit volume in ppm/hour."""
    dt = _axis(time_s)
    if not math.isfinite(initial_ppm) or initial_ppm <= 0:
        raise ValueError("initial CO2 must be positive")
    if not math.isfinite(rate_ach) or rate_ach < 0:
        raise ValueError("rate must be finite and nonnegative")
    n = dt.size + 1
    supply = _series(supply_ppm, n, "supply CO2", strictly_positive=True)
    generation = _series(generation_ppm_h, n, "generation")
    return _trajectory(dt, initial_ppm, supply, rate_ach, generation)


def fit_rate(time_s, room_ppm, supply_ppm, generation_ppm_h=0.0, max_rate=MAX_RATE):
    """Conditional least squares given initial observation and prescribed generation."""
    dt = _axis(time_s)
    n = dt.size + 1
    if not math.isfinite(max_rate) or max_rate <= 0:
        raise ValueError("max_rate must be positive and finite")
    obs = _series(room_ppm, n, "room CO2", scalar=False, strictly_positive=True)
    b = _series(supply_ppm, n, "supply CO2", strictly_positive=True)
    g = _series(generation_ppm_h, n, "generation")

    def loss(rate):
        residual = _trajectory(dt, obs[0], b, rate, g)[1:] - obs[1:]
        return np.mean(residual**2)

    # Refine every sampled local minimum; include monotone edge intervals and endpoints.
    grid = np.linspace(0.0, max_rate, 31)
    scores = [loss(x) for x in grid]
    if max(scores) == min(scores):
        raise ValueError("rate objective is flat")
    candidates = [(scores[0], 0.0), (scores[-1], max_rate)]
    for i, val in enumerate(scores):
        if i and val > scores[i - 1]:
            continue
        if i + 1 < len(grid) and val > scores[i + 1]:
            continue
        bounds = (grid[max(0, i - 1)], grid[min(len(grid) - 1, i + 1)])
        opt = minimize_scalar(loss, bounds=bounds, method="bounded",
                              options={"xatol": 1e-9})
        if not opt.success or not math.isfinite(opt.fun):
            raise ValueError("rate optimization failed")
        candidates.extend([(val, grid[i]), (opt.fun, opt.x)])
    mse, rate = min(candidates)
    return float(rate), float(np.sqrt(mse))


def log_decay(time_s, room_ppm, background_ppm):
    """Free-intercept OLS of log excess on hours for a constant positive background."""
    dt = _axis(time_s)
    obs = _series(room_ppm, len(dt) + 1, "room CO2", scalar=False, strictly_positive=True)
    if not math.isfinite(background_ppm) or background_ppm <= 0:
        raise ValueError("invalid fixed background")
    excess = obs - background_ppm
    if np.any(excess <= 0):
        raise ValueError("nonpositive excess")
    x = np.r_[0., np.cumsum(dt)]
    x -= x.mean()
    rate = -float(x @ (np.log(excess) - np.log(excess).mean()) / (x @ x))
    if rate <= 0:
        raise ValueError("no declining log trend")
    return rate
