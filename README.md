# VentLab

Two ventilation rates can explain the same indoor CO₂ record when the occupants’ CO₂ generation is unknown. VentLab lets you inspect those competing explanations, choose another measurement and see whether it improves the estimate.

The [public application](https://giandegruccio.github.io/ventlab/) runs the reviewed Phase 2 release. This Phase 3 branch adds robust measurement planning and paired synthetic experiments.

## Try the Phase 3 experiment

In **Experiment designer**, choose **Start guided demo**. An occupied room holds steady at 520 ppm. Inspect the combinations of generation and ventilation that produce that reading, then choose **Compare an empty room**. The paired trajectories, linked residual maps and recovery table show what changed when the source was removed.

For your own simulated experiment, select **Robust ensemble** or **Configured scenario** in **Measurement strategies**, choose a feasible action and run the comparison. **Methods** contains the 256-trial stress comparison, including cases where a narrower range accompanied a worse estimate. **Blind validation** separately evaluates retrospective room recordings against measured mechanical airflow. Prospective field validation remains open.

- [Ensemble assumptions, objective and constraints](docs/robust-planning.md)
- [Independent synthetic stress protocol and results](docs/stress-protocol.md)
- [Browser checks and screenshots](docs/phase3-qa.md)

## Run locally

With Node.js 24 and npm installed, run the following from the repository root.

```sh
cd web
npm ci
npm run dev
```

Open the URL printed by Vite. For a static distribution, run `npm run build` in `web/` and serve `web/dist/`. The application uses hash navigation and relative asset URLs for GitHub Pages project paths.

- [Application guide, deployment and verification](docs/web-application.md)
- [Experiment design model, strategy ranking and seeded benchmark](docs/design-study.md)
- [Python–TypeScript numerical agreement](docs/parity.md)
- Phase 2 screenshots: [Desktop](docs/screenshots/designer-1440.png) · [Mobile](docs/screenshots/designer-390.png) · [Identifiability and strategy ranking](docs/screenshots/measurement-design.png) · [Blind validation](docs/screenshots/validation-1440.png)

## Phase 1 scientific reference

Phase 1 estimates a constant effective air-change rate from one room's CO₂ record and reports when the data give little support for that estimate. The default run is offline. See [the computed findings](reports/findings.md) and [the scientific protocol](docs/science.md).

## Reproduce

Use Python 3.12.14. Run the following from this directory. A clean environment needs internet access once to install the pinned scientific packages.

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m ventlab.run
```

The command verifies the size and MD5 of each CSV against the saved Zenodo record, writes SHA-256 digests to the audit and recomputes every reported result. Pass `--data DIR` to select a data directory containing `raw/` and `zenodo-record.json`. Pass `--out DIR` to write a fresh comparison run. There is no random component to inference, windowing, or scoring. The synthetic reference-blindness test uses a fixed seed.

## Files

| Path | Purpose |
|---|---|
| `data/raw/*.csv` | Unchanged source CSV byte streams |
| `data/zenodo-record.json` | Publisher metadata, attribution, license, file sizes and checksums |
| `ventlab/protocol.py` | Field names, units and declared physical and analysis constants |
| `ventlab/data.py`, `audit.py` | Integrity, source-order sessions, occupancy periods and sensor audit |
| `ventlab/physics.py` | Simulation, conditional constant-rate fit and log-linear baseline |
| `ventlab/inference.py` | Reference-blind windows, abstention, sensitivity scenarios and diagnostic flags |
| `ventlab/evaluation.py`, `report.py`, `run.py` | Reference handling, metrics, report rendering and offline entry point |
| `tests/` | Automated numerical, diagnostic, audit and leakage regression tests |
| `reports/audit.json` | Columns, units, ranges, sampling intervals, anomalies and individual session bounds |
| `reports/predictions.json` | Predictions, scenario fits and failures before airflow joins |
| `reports/windows.csv` | Every occupancy period, status, diagnostics, baseline and mechanical comparison |
| `reports/metrics.json`, `findings.md` | File, session, duration, signal and diagnostic-group performance |
| `reports/test-results.txt` | Captured automated test run |
| `docs/science.md`, `NOTICE.md` | Scientific interpretation, data provenance and separate licensing information |

The audit's data-row numbers start at 1 after the CSV header. Prediction and scoring row indices start at 0. Empty numeric fields in the ledger and JSON nulls denote unavailable comparisons. A fitted zero is a numeric result at the lower search boundary. All air-change rates and absolute errors use h⁻¹.

## Review status

The original Phase 1 analysis workspace had no root CSVs or repository checkout. The three CSVs from this repository matched the archived originals byte-for-byte at integration. The Phase 1 tree was created in the shared workspace using the exact bytes from the specified Zenodo version. The source record, code, tests and reports travel together in the review archive. This retrospective analysis cannot establish generalization to another room or a previously unseen collection.
