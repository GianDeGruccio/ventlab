"""Check the distributed dataset, split, ledger and published numerical results."""
import csv
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

from ventlab.data import read, verify
from ventlab.protocol import FILES
from ventlab.run import run


class ReleaseTests(unittest.TestCase):
    def test_regenerated_reports_cover_original_data(self):
        project = Path(__file__).resolve().parents[1]
        data = project / "data"
        digests = verify(data)
        with TemporaryDirectory() as folder:
            out = Path(folder)
            run(data, out)
            audits = json.loads((out / "audit.json").read_text())
            metrics = json.loads((out / "metrics.json").read_text())
            with (out / "windows.csv").open() as f:
                ledger = list(csv.DictReader(f))
            for name in FILES:
                frame = read(data / "raw", name)
                rows = [r for r in ledger if r["file"] == name]
                # Independently verify complete, ordered, non-overlapping source row coverage.
                cursor = 0
                for r in rows:
                    self.assertEqual(int(r["first_row"]), cursor)
                    cursor += int(r["samples"])
                    self.assertEqual(int(r["last_row"]) + 1, cursor)
                self.assertEqual(cursor, len(frame))
                self.assertEqual(digests[name], audits[name]["sha256"])
                self.assertEqual(len(rows), metrics[name]["all"]["periods"])
                comparable = [abs(float(r["rate_ach"]) - float(r["reference_ach"])) for r in rows
                              if r["rate_ach"] and r["reference_ach"]]
                self.assertEqual(len(comparable), metrics[name]["all"]["scored"])
                self.assertAlmostEqual(np.mean(comparable), metrics[name]["all"]["mae_ach"])
            self.assertGreater(audits["ventilation_test.csv"]["time_start"],
                               max(audits[name]["time_end"] for name, role in FILES.items() if role == "development"))

    def test_checksum_failure(self):
        project = Path(__file__).resolve().parents[1]
        original = project / "data"
        record = (original / "zenodo-record.json").read_bytes()
        with TemporaryDirectory() as folder:
            data = Path(folder)
            (data / "zenodo-record.json").write_bytes(record)
            raw = data / "raw"
            raw.mkdir()
            for name in FILES:
                (raw / name).write_bytes(b"changed file")
            with self.assertRaisesRegex(ValueError, "source integrity failure"):
                verify(data)
