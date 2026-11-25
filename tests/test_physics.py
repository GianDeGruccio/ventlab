import math
import unittest
import numpy as np
from numpy.testing import assert_allclose
from scipy.integrate import solve_ivp

from ventlab.physics import fit_rate, log_decay, simulate


class PhysicsTests(unittest.TestCase):
    def test_exact_decay_both_estimators_irregular_and_regular(self):
        for t in (np.arange(61)*60., np.array([0., 16., 44., 81., 122., 980., 2401., 3950.])):
            with self.subTest(t=t[-1]):
                c = 410. + 620.*np.exp(-2.3*t/3600.)
                assert_allclose(simulate(t, 1030., 410., 2.3), c, atol=1e-9)
                k, rmse = fit_rate(t, c, 410.)
                self.assertAlmostEqual(k, 2.3, places=6)
                self.assertLess(rmse, 1e-5)
                self.assertAlmostEqual(log_decay(t, c, 410.), 2.3, places=11)

    def test_varying_forcing_against_independent_ode_solver(self):
        t = np.array([0., 20., 200., 890., 1100., 2500., 4800.])
        b = [400., 650., 700., 600., 430., 410., 1000.]
        g = [30., 5., 20., 0., 45., 12., 50.]
        c = [900.]
        k = 1.73
        for i in range(len(t)-1):
            sol = solve_ivp(lambda _, y: (k*(b[i]-y) + g[i])/3600.,
                            (t[i], t[i+1]), [c[-1]], rtol=1e-11, atol=1e-10)
            self.assertTrue(sol.success)
            c.append(sol.y[0, -1])
        assert_allclose(simulate(t, c[0], b, k, g), c, rtol=1e-10)
        self.assertAlmostEqual(fit_rate(t, c, b, g)[0], k, places=6)

    def test_varying_supply_unoccupied_can_rise(self):
        t = [0., 3600., 7200.]
        # At log(2) per hour, half the excess is exchanged each hour.
        assert_allclose(simulate(t, 600., [400., 800., 900.], math.log(2)), [600., 500., 650.])
        self.assertAlmostEqual(fit_rate(t, [600., 500., 650.], [400., 800., 900.])[0], math.log(2), places=6)

    def test_zero_and_tiny_rates_with_generation(self):
        for k in (0., 1e-15, 1e-320):
            assert_allclose(simulate([0., 1., 3600.], 600., 420., k, 36.),
                            [600., 600.01, 636.], atol=1e-11, rtol=0.)

    def test_large_exchange_and_stiff_limit(self):
        assert_allclose(simulate([0., 3600000.], 2000., 400., 100., 2.), [2000., 400.02])
        self.assertAlmostEqual(fit_rate([0, 60, 120], [500, 500, 500], 400.)[0], 0.)

    def test_search_bounds_report_endpoints(self):
        t = np.arange(12) * 60.
        for k in (.08, 4.5, 29.95, 35.):
            c = 425 + 700 * np.exp(-t * k / 3600)
            self.assertAlmostEqual(fit_rate(t, c, 425.)[0], min(30., k), places=5)

    def test_flat_objective_and_invalid_baseline(self):
        with self.assertRaisesRegex(ValueError, "flat"):
            fit_rate([0, 1], [410, 410], 410)
        for c in ([411, 410], [500, 510], [500, 500]):
            with self.assertRaises(ValueError):
                log_decay([0, 60], c, 410.)

    def test_invalid_inputs(self):
        for t in ([0.], [0., 0.], [1., 0.], [0., np.nan], [[0., 1.]]):
            with self.assertRaises(ValueError):
                simulate(t, 600., 410., 2.)
        for b, k, g in (([400.], 2., 0.), (410., -1., 0.), (0., 2., 0.), (410., 2., -1.), (np.inf, 2., 0.)):
            with self.assertRaises(ValueError):
                simulate([0, 1], 600., b, k, g)
        for c in ([600], [600, np.nan], [600, -1]):
            with self.assertRaises(ValueError):
                fit_rate([0, 60], c, 410.)
