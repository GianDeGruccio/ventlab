# Python and browser numerical agreement

The TypeScript module `web/src/physics.ts` ports the one-zone balance and Phase 1 window diagnostics. The time axis uses **seconds**, ventilation uses **h⁻¹**, supplied generation uses **ppm/h**, and room and supply CO₂ use **ppm**. Each interval holds its starting supply concentration and generation constant. The zero-rate limit and the small-exposure source term follow the Python implementation. The fitting function uses all observations after the fixed initial reading, one squared residual per observation.

The rate optimizer scans the same 31 points from 0 to 30 h⁻¹ and refines every sampled local minimum. TypeScript uses golden-section minimization to a bracket width of 10⁻⁹ h⁻¹. Python uses SciPy bounded scalar minimization. Both retain endpoint and sampled-grid candidates. Floating-point reduction order and local optimizer stopping behavior can change the last digits of the results, especially with a shallow objective. The conventional baseline fits a free intercept to the log of positive room excess above a time-weighted fixed supply. A mathematically constant log series abstains.

The window API accepts a timestamp vector plus indoor CO₂, optional supply CO₂, and occupancy. A user selection containing any occupied or unknown-occupancy sample abstains because generation is unknown. Duplicate or decreasing times and nonphysical or missing concentrations abstain. Users can select irregularly spaced finite timestamps within a continuous recording. The caller chooses the recording/session boundaries. The estimator accepts no reference airflow. Its seven stress scenarios preserve indoor offset, coherent duct offset or assumed background shift, and indoor drift as specified in the Phase 1 protocol. [Phase 1 scientific protocol](science.md)

## Reproduce

From the repository root, generate the synthetic fixtures with the original Python dependencies installed. The JSON includes inputs, full Python trajectories and Python estimates.

```sh
python -m scripts.phase2_fixtures
cd web
npm ci
VENTLAB_PARITY_SUMMARY=1 npm test -- --disableConsoleIntercept tests/physics.test.ts
```

The test reads every original CSV and compares its selected time, room, supply and occupancy inputs with the archived pre-airflow predictions. It checks status, reason, flags, log-linear fit availability, half-window availability, all seven scenario rates where present, and missing outputs. The three original files can also be evaluated individually in the Blind Validation Lab. The regression limits are 10⁻⁹ ppm for forward trajectories, 10⁻⁵ h⁻¹ for archived rate quantities and 10⁻⁶ ppm for archived residual RMSE. Separate synthetic tests cover irregular sample times, time-varying generation and supply, the interval with no ventilation, subnormal rates, and a stiff long interval.

## Results on the original files

The 340 archived periods contain 136 nominal physics fits. All period statuses, warnings, baseline statuses and half-window assessment statuses agreed. Five generated synthetic trajectories had zero observed difference at the stored double-precision sample values. For the three of these fixtures with fitted rates, the largest rate difference was 4.25 × 10⁻¹⁰ h⁻¹. The following are measured maximum absolute differences across the archived periods.

| Output | Maximum absolute difference |
|---|---:|
| Nominal physics fit | 4.96 × 10⁻⁷ h⁻¹ |
| Log-linear baseline | 5.33 × 10⁻¹⁵ h⁻¹ |
| Trajectory residual RMSE | 1.57 × 10⁻¹³ ppm |
| Individual stress-scenario rate | 8.39 × 10⁻⁶ h⁻¹ |
| Complete sensitivity width | 3.88 × 10⁻⁶ h⁻¹ |

These comparisons measure implementation agreement. Accuracy against an independent physical reference is a separate empirical question. [Phase 1 retrospective results](../reports/findings.md)
