"""Load the versioned source and partition it in original row order."""
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .protocol import CADENCE_S, FILES, TIME, OCC


def verify(root):
    record = json.loads((root / "zenodo-record.json").read_text())
    if record["id"] != 18299691 or {f["key"] for f in record["files"]} != set(FILES):
        raise ValueError("unexpected source record or files")
    out = {}
    for f in record["files"]:
        data = (root / "raw" / f["key"]).read_bytes()
        digest = "md5:" + hashlib.md5(data, usedforsecurity=False).hexdigest()
        if len(data) != f["size"] or digest != f["checksum"]:
            raise ValueError(f"source integrity failure: {f['key']}")
        out[f["key"]] = hashlib.sha256(data).hexdigest()
    return out


def read(raw, name, columns=None):
    return pd.read_csv(Path(raw) / name, usecols=columns)


def timestamps(frame):
    return pd.to_datetime(frame[TIME], format="%Y-%m-%d %H:%M:%S", errors="coerce")


def sessions(frame):
    """A session is a conservative uninterrupted block, split at every off-cadence step."""
    delta = timestamps(frame).diff().dt.total_seconds()
    return delta.ne(CADENCE_S).cumsum()


def occupancy_states(frame):
    occ = pd.to_numeric(frame[OCC], errors="coerce")
    valid = np.isfinite(occ) & (occ >= 0) & (occ <= 4) & (occ % 1 == 0)
    return pd.Series(np.select([valid & (occ == 0), valid & (occ > 0)],
                               ["unoccupied", "occupied"], default="unknown"), index=frame.index)


def periods(frame):
    states = occupancy_states(frame)
    for session, block in frame.groupby(sessions(frame), sort=False):
        state = states.loc[block.index]
        for _, run in block.groupby(state.ne(state.shift()).cumsum(), sort=False):
            yield int(session), state.loc[run.index[0]], run
