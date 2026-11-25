"""Run from the project root with python -m ventlab.run."""
import argparse
import csv
import json
from pathlib import Path

from .audit import audit
from .data import read, verify
from .evaluation import score, summaries
from .inference import infer_periods
from .protocol import FILES, FLOW, OCC, ROOM, SUPPLY, TIME


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False, ensure_ascii=False) + "\n")


def run(data, out):
    digests = verify(data)
    out.mkdir(parents=True, exist_ok=True)
    raw = data / "raw"
    # Complete all predictions before reading any airflow for scoring or audit.
    preds = {}
    for name in FILES:
        df = read(raw, name, lambda c: c in (TIME, ROOM, SUPPLY, OCC))
        preds[name] = infer_periods(df)
    write_json(out / "predictions.json", preds)
    audits, metrics, ledger = {}, {}, []
    for name, role in FILES.items():
        obs = read(raw, name)
        audited = audit(obs)
        audits[name] = dict(audited, sha256=digests[name], role=role)
        rows = score(preds[name], obs[[TIME, FLOW]])
        metrics[name] = summaries(rows)
        for r in rows:
            ledger.append(dict(file=name, role=role, **r))
    if max(a["time_end"] for a in audits.values() if a["role"] == "development") >= min(
            a["time_start"] for a in audits.values() if a["role"] == "evaluation"):
        raise ValueError("development and evaluation dates overlap")
    write_json(out / "audit.json", audits)
    write_json(out / "metrics.json", metrics)
    keys = list(dict.fromkeys(k for row in ledger for k in row))
    with (out / "windows.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for row in ledger:
            w.writerow({k: json.dumps(v, sort_keys=True) if isinstance(v, (list, dict)) else v
                        for k, v in row.items()})
    from .report import render
    (out / "findings.md").write_text(render(audits, metrics, ledger))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("data"))
    parser.add_argument("--out", type=Path, default=Path("reports"))
    args = parser.parse_args()
    run(args.data, args.out)
