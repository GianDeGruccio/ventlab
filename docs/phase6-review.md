# RC1 scientific corrections

The audited application was revision `e3accf6`. The historical Phase 2 and Phase 3 evidence files retain their original bytes. RC1 uses a different numerical recovery procedure, a revised random generator and a matched nominal comparator. The new stress protocol was committed at `b778c8f` before the comparison ran. [Predeclared protocol](phase6-protocol.md)

## Audit reproductions

| Observation | Audited application | RC1 |
|---|---|---|
| Designer configurations A and B | The observed curves start at 790 ppm and agree to floating-point precision. Physical starts of 760 and 820 ppm nevertheless selected supply measurement and an empty room, respectively. | A separate expected sensor reading of 790 ppm gives identical complete ranked plans in both exported reports. In order, the actions are empty, keep current, measure supply and longer. Scores are 0.015846, 0, −0.106405 and −0.194976 h⁻¹. The physical start remains a simulation parameter. |
| Empty-room high-contrast decay at 2.019 h⁻¹ | Grid fit 2.000000 and compatible endpoints 1.999989526 and 2.000081368 h⁻¹. | Fit 2.0189999999. Endpoints 2.0180249799 and 2.0199754272 h⁻¹. An independent SciPy calculation agrees within 10⁻⁷ h⁻¹. |
| Ventilation test session 2, period 2, 2025-11-25 06:37, sensor SD 18 ppm | The planner ranked higher precision while the empirical fit abstained. | Precision still ranks first under the design objective. The plan and export explain that the occupied repeat is ineligible for retrospective decay inference. An empty repeat requires fixed fan operation to address the original target. |
| Occupied equilibrium, 520 ppm room and 420 ppm supply | Both 2 h⁻¹ with 200 ppm/h and 0.30 h⁻¹ with 30 ppm/h produced the same flat trace and the same arbitrary 0.30 h⁻¹ point. Changing the generating truth changed the displayed error. | Both examples have a non-unique fit and compatible range 0–8 h⁻¹. Point errors and directional accuracy are unavailable. The empty-room teaching intervention reduces ambiguity. Its label and report identify its separate instructional purpose. |
| Two observations, one hour apart, 1500 to 700 ppm, supply 420 ppm | One fitted rate can explain the only subsequent observation. An RMSE is computable even when residual replication is absent. | Python and TypeScript flag insufficient residual information and expose the unavailable half-window diagnostic. The positive fit remains inspectable. |
| CSV and project assets | The original CSV reader accepted an open quote at EOF. The original HTML omitted the project icon. | Unterminated fields raise an error. Escaped quotes and embedded newlines remain supported. The built icon resolves under the project prefix. |

## Continuous inverse problem

At each candidate rate the estimator eliminates the initial state by least squares, then projects the effective source onto the applicable bounded interval. The nominal fit bounds generation. The compatibility fit additionally profiles room and duct offsets. Residuals are accumulated directly for stability near an exact fit. The nominal best rate and the minimum used in the compatibility threshold can therefore differ.

A discovery mesh at 0.05 h⁻¹ brackets sampled extrema, including endpoint neighborhoods. Golden-section refinement evaluates the actual loss within brackets. The threshold is the refined compatibility minimum plus four times the larger of the stated noise variance and 1 ppm². Bisection finds transitions to within 10⁻⁹ h⁻¹. Crossing pairs describe separate compatible regions. The width objective uses the outer span; containment is tested against the regions themselves. Flat full-domain profiles, constrained extrema, weak contrast and disjoint regions have regression cases. The heat map still samples a finite grid for rendering. Extremely narrow additional extrema between discovery points cannot be ruled out for arbitrary loss functions. The design calculation assumes a bounded, constant-rate, single-zone model.

The robust worker evaluates the same continuous loss on analytically projected expected traces. It caches projections by time schedule, scenario rate and continuous candidate rate. A 216-world direct-fit comparison checks the projection shortcut. Across the eight stress cases, three-call median compute times on the recorded Node host ranged from 11.49 to 97.50 ms. At the supported 480-minute, 15-second cadence, the median was 771 ms. The historical grid was faster. Worker cancellation on input changes prevents superseded rankings from being applied. [Timing measurements](../reports/phase6/timing.json) · [Independent SciPy check](../scripts/phase6_reference.py)

## Revised evidence

The six scenario-conditioned evaluation cases retain all 192 original draws. Revised mean baseline/chosen MAE is 1.075/0.389 h⁻¹, versus 1.071/0.392 historically. Mean spans changed from 4.091/2.317 to 4.093/2.319 h⁻¹. Baseline/chosen containment stayed at 159/192 and 152/192. Continuous refinement changes estimates and width rankings even when the generator stays fixed. [Revised scenario study](../reports/phase6/scenario-study.json) · [Historical version](../reports/phase2-synthetic.json)

The revised stress study uses SHA-256 draws namespaced by seed, stream tag and block counter. Each action uses the same keyed streams for its trial. The stream construction removes the original XOR/LCG relationship; finite-sample correlations need not vanish. Both planning policies may keep the current design, observe the same availability and duration cap, and pay 0.25 h⁻¹ per additional observation hour. The nominal policy optimizes one scenario; robust planning averages the mean and worst paired reductions over the ensemble. The interactive legacy configured-scenario mode retains its original unpenalized decision rule.

| Policy | Historical MAE | RC1 MAE | RC1 mean width | RC1 mean minutes | RC1 target inside |
|---|---:|---:|---:|---:|---:|
| Keep current | 1.533 | 1.471 | 3.773 | 40.25 | 447/768 |
| Nominal | 1.328 | 1.314 | 2.883 | 45.50 | 370/768 |
| Simple rule | 1.116 | 1.209 | 2.809 | 60.00 | 353/768 |
| Robust | 1.106 | 1.198 | 2.832 | 45.25 | 356/768 |

Rate errors and widths are in h⁻¹. The historical comparator used one block and a different nominal objective. Changes in the stress results combine the numerical correction, keyed draws, decision rules and seed blocks. They cannot be attributed to one change from this comparison alone.

Robust MAE was 1.112, 1.241 and 1.241 h⁻¹ in the three blocks. Robust planning narrowed compatible ranges and increased rate error in 154/768 trials. In the opposed-bias case its mean error moved from 0.509 to 0.504 h⁻¹, reversing the historical average direction. All 96 resulting ranges nevertheless missed the target. The jointly drifting source/fan case also missed 96/96. Outside the planning envelope, robust error increased from 2.294 to 2.772 h⁻¹. In the separately reported occupancy-responsive control, the tested empty intervention changes the target from 1.4 to 0.7 h⁻¹. Recovering the latter cannot validate the occupied-room rate. [Per-trial outcomes, blocks and control](../reports/phase6/stress.json) · [Original study](stress-protocol.md)

All five regenerated empirical artifacts are byte-identical to their historical equivalents. No bundled window receiving a decay fit had just two observations. The new warning matters for user-selected and imported windows. Mechanical supply remains an imperfect reference. [RC1 empirical reports](../reports/phase6/empirical)

## Reproduce

Use the pinned Python requirements, Node 24 and the committed npm lockfile. From the repository root:

```sh
python scripts/phase6_reference.py
python -m ventlab.run --out reports/phase6/empirical
python -m unittest discover -s tests -v
cd web
npm ci
npm run benchmark
npm run stress
npm test
npm run build
cd ..
python scripts/browser_smoke.py --engines chromium firefox webkit --axe-script web/node_modules/axe-core/axe.min.js
```

The browser command needs Playwright and its three engines. [Installation instructions](phase3-qa.md). Use `npm run benchmark:historical` and `npm run stress:historical` in `web` to regenerate the frozen evidence with the archived algorithm. Run `npx tsx phase6-timing.ts` separately to measure local runtime. The two browser assertions that referenced old stress outcomes now use the revised 0/96 containment count and 1.198 h⁻¹ robust MAE. The original unit cases remain in the suite. This is synthetic and retrospective evidence; prospective field performance, human usability and probability coverage remain open.

The regression suite includes 20 Python and 67 TypeScript tests. The browser journey applies both exact physical configurations through the Designer, downloads the decisions and compares all ranked alternatives. A second pass disables the empty-room action and verifies that changing hidden physical settings preserves the constraint. The import journey cancels and then loads a 3,791,512-byte, 30,000-row CSV. Chart inspection retains full resolution and reuses plotted curves during cursor movement. These checks cover selected workloads on emulated viewports. They do not establish a real-device latency bound.
