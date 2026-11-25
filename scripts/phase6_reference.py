"""Independent bounded linear least squares and SciPy scalar search for the audited decay."""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import brentq, minimize_scalar

def reference(rate, start, minutes, cadence, noise):
    t = np.arange(0, minutes + cadence, cadence) / 60
    y = (start - 430) * np.exp(-rate * t)
    def loss(k, offset_bound):
        e = np.exp(-k * t)
        u = -np.expm1(-k * t) / k if k else t
        design = np.column_stack((e, u))
        _, source = np.linalg.lstsq(design, y, rcond=None)[0]
        source = np.clip(source, -k * offset_bound, k * offset_bound)
        start_fit = np.dot(e, y - u * source) / np.dot(e, e)
        residual = y - e * start_fit - u * source
        return np.dot(residual, residual)
    def best(bound):
        f = lambda k: loss(k, bound)
        x = minimize_scalar(f, bounds=(0, 8), method="bounded", options={"xatol":1e-12}).x
        return min((0, x, 8), key=f)
    center = best(40)
    threshold = loss(center, 40) + 4 * max(noise, 1)**2
    cross = lambda k: loss(k, 40) - threshold
    return dict(rate=rate, initial=start, duration=minutes, interval=cadence, noise=noise,
                fit=best(0), low=0 if cross(0)<=0 else brentq(cross,0,center),
                high=8 if cross(8)<=0 else brentq(cross,center,8))
if __name__ == "__main__":
    cases=[(2.019,3000,240,1,0),(.007,1700,60,1,0),(7.998,1600,60,1,0),
           (0,1400,60,2,0),(8,1400,60,2,0),(.7,432,50,2,25)]
    Path("web/fixtures/phase6-reference.json").write_text(json.dumps([reference(*c) for c in cases],indent=2)+"\n")
