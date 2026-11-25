"""Run python -m scripts.phase2_fixtures from the repository root."""
import json
from pathlib import Path

import numpy as np

from ventlab.inference import characterize
from ventlab.physics import fit_rate, log_decay, simulate


def reference_trajectory(name, t, initial, supply, rate, source, estimate=True):
    room = simulate(t, initial, supply, rate, source)
    case = dict(name=name, timeS=t, initial=initial, supply=supply, rate=rate,
                generation=source, expectedPpm=room.tolist())
    if estimate:
        case["expectedRate"], case["expectedRmse"] = fit_rate(t, room, supply, source)
    if np.isscalar(supply) and np.isscalar(source) and source == 0 and rate > 0:
        case["expectedLogRate"] = log_decay(t, room, supply)
    return case


def reference_window(name, t, room, supply):
    measured = supply is not None
    background = supply if measured else np.full(len(t), 420.)
    expected = characterize(t, room, background, measured)
    observations = dict(timeS=t.tolist(), room=room.tolist(), occupancy=[0] * len(t))
    if measured:
        observations["supply"] = supply.tolist()
    return dict(name=name, window=observations, expected=expected)


def main():
    t = [0., 3., 157., 629., 1035., 2500., 3720.]
    varying = [410., 430., 450., 500., 470., 440., 450.]
    source = [0., 60., 177., 240., 90., 0., 0.]
    trajectories = [
        reference_trajectory("regular exponential", list(range(0, 2401, 60)), 900., 418., 2.37, 0.),
        reference_trajectory("irregular forcing and known generation", t, 1030., varying, 1.4, source),
        reference_trajectory("generation with zero exchange", t, 610., 415., 0., 40.),
        reference_trajectory("subnormal rate", t, 610., 415., 1e-320, 55., estimate=False),
        reference_trajectory("stiff equilibration", [0., 3600000.], 2000., 400., 100., 2., estimate=False),
    ]
    times = np.array([0., 40., 190., 370., 620., 915., 1020., 1420., 1850., 2600., 3600.])
    b = 430. + 20 * np.sin(times / 800)
    room = simulate(times, 980., b, 1.6) + 5. * np.cos(times / 200.)
    regular = np.arange(61) * 60.
    hours = regular / 3600.
    piecewise = 420 + 1500 * np.exp(-3 * np.minimum(hours, .5) - .6 * np.maximum(hours-.5, 0))
    windows = [
        reference_window("changing measured supply", times, room, b),
        reference_window("assumed supply and changing rate", regular, piecewise, None),
        reference_window("flat objective", regular, np.full(61, 420.), np.full(61, 420.)),
        reference_window("short selection", times[:3], room[:3], b[:3]),
    ]
    path = Path(__file__).resolve().parents[1] / "web/fixtures/python-physics.json"
    path.write_text(json.dumps(dict(trajectories=trajectories, windows=windows),
                               indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
