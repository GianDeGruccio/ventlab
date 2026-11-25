import unittest
import numpy as np
import pandas as pd
from numpy.testing import assert_allclose

from ventlab.audit import audit
from ventlab.data import periods
from ventlab.evaluation import mechanical_reference, score, summarize
from ventlab.inference import infer_periods
from ventlab.protocol import FLOW, OCC, ROOM, SUPPLY, TIME, VOLUME_M3


def fixture(n=91):
    minutes = np.arange(n)
    return pd.DataFrame({TIME: pd.date_range("2025-01-01", periods=n, freq="min").astype(str),
                         ROOM: 420+1000*np.exp(-1.8*minutes/60.), SUPPLY: 420.,
                         OCC: 0, FLOW: 10.})


class PipelineTests(unittest.TestCase):
    def test_reference_units_time_weighted(self):
        r = mechanical_reference([0, 60, 240], [1., 3., 7.])
        self.assertAlmostEqual(r["mean_supply_lps"], (2+3*5)/4)
        self.assertAlmostEqual(r["reference_ach"], 4.25*3.6/21.8697)
        self.assertAlmostEqual(VOLUME_M3, 21.8697)

    def test_scoring_zero_and_near_zero(self):
        block = fixture()
        pred = infer_periods(block)
        for q, relative in [(0, False), (.4, False), (1., False), (1.01, True)]:
            row = score(pred, block.assign(**{FLOW: q}))[0]
            self.assertIn("abs_error_ach", row)
            self.assertEqual("ape_percent" in row, relative)
            self.assertEqual(summarize([row])["relative_n"], int(relative))

    def test_invalid_reference_preserves_estimate(self):
        block = fixture()
        pred = infer_periods(block)
        for q, status in [(-.001, "negative_flow"), (np.nan, "incomplete_flow")]:
            block.loc[5, FLOW] = q
            r = score(pred, block)[0]
            self.assertEqual(r["rate_ach"], pred[0]["rate_ach"])
            self.assertEqual(r["reference_status"], status)
            self.assertNotIn("reference_ach", r)
        self.assertNotIn("reference_ach", mechanical_reference([1, 1], [1, 1]))
        with self.assertRaises(ValueError):
            mechanical_reference([0, 1], [10])

    def test_reference_blind_selection_and_fit(self):
        block = fixture()
        p = infer_periods(block)
        for flow in (np.random.default_rng(9).normal(size=len(block)), np.full(len(block), np.nan)):
            self.assertEqual(infer_periods(block.assign(**{FLOW: flow})), p)
        self.assertEqual(infer_periods(block.drop(columns=FLOW)), p)

    def test_occupancy_boundaries_and_short_windows(self):
        block = fixture(25)
        block.loc[10:11, OCC] = [1, 2]
        block.loc[12, OCC] = np.nan
        p = infer_periods(block)
        self.assertEqual([r["state"] for r in p], ["unoccupied", "occupied", "unknown", "unoccupied"])
        self.assertEqual([r["samples"] for r in p], [10, 2, 1, 12])
        self.assertEqual([r["reason"] for r in p[:3]], ["under_minimum_duration", "unknown_generation", "unknown_generation"])
        self.assertIn("rate_ach", p[3])

    def test_audit_and_session_integrity(self):
        block = fixture(8)
        block.loc[2, TIME] = block.loc[1, TIME]
        block.loc[4, TIME] = block.loc[0, TIME]
        block.loc[6, TIME] = "invalid"
        block.loc[7, ROOM] = np.nan
        block.loc[3, FLOW] = -1.
        r = audit(block)
        self.assertEqual(r["duplicate_timestamp_rows_beyond_first"], 2)
        self.assertEqual(r["reverse_steps"], 1)
        self.assertEqual(r["invalid_timestamps"], 1)
        self.assertEqual(r["columns"][ROOM]["missing"], 1)
        self.assertEqual(r["observations"][FLOW]["negative"], 1)
        self.assertEqual(len(r["sessions"]), 7)
        self.assertEqual(sum(len(b) for _, _, b in periods(block)), len(block))
        self.assertTrue(any(row["reason"] == "invalid_measurements" for row in infer_periods(block)))

    def test_sensitivity_contains_nominal_and_flags_short_flat_signal(self):
        block = fixture(12)
        block[ROOM] = 434.
        r = infer_periods(block)[0]
        self.assertEqual(r["status"], "flagged")
        self.assertTrue({"low_variation", "short_duration", "weak_room_supply_contrast"}.issubset(r["flags"]))
        self.assertLessEqual(r["sensitivity_low_ach"], r["rate_ach"])
        self.assertGreaterEqual(r["sensitivity_high_ach"], r["rate_ach"])
        self.assertEqual(len(r["scenario_rates"]), 7)
        self.assertIn("assumed_background", infer_periods(block.drop(columns=SUPPLY))[0]["flags"])

    def test_residual_and_change_diagnostics(self):
        block = fixture(61)
        t = np.arange(61)/60.
        block[ROOM] = 420 + 1500*np.exp(-3*np.minimum(t, .5) - .6*np.maximum(t-.5, 0))
        r = infer_periods(block)[0]
        assert_allclose([r["first_half_ach"], r["second_half_ach"]], [3, .6], atol=1e-6)
        self.assertTrue({"possible_rate_change", "large_fit_residual"}.issubset(r["flags"]))

    def test_no_signal_and_missing_supply_recorded(self):
        block = fixture(21)
        block[ROOM] = block[SUPPLY]
        self.assertEqual(infer_periods(block)[0]["reason"], "rate objective is flat")
        block.loc[5, SUPPLY] = np.nan
        self.assertEqual(infer_periods(block)[0]["reason"], "invalid_measurements")
