# Independent synthetic stress evaluation

## Design and provenance

This study asks how the measurement policies behave when the physical room and sensor errors depart from the constant-source, constant-rate, independent-noise model used to rank experiments. We fixed the case definitions, feasibility constraints, interventions, metrics, and seed sequences before running the comparison. The protocol is committed at `95bf08b` with SHA-256 `48071511f08fa9f5fb947981edb82d4330a62a6dddab03c203439c56fed65dc2`. The planner and observation-fit functions were frozen at `2e92c0c`. Neither file's parameters were tuned on these results. The original Phase 2 evidence is preserved separately. [Frozen protocol](../web/fixtures/phase3-stress-protocol.json) · [Original Phase 2 study](design-study.md)

Each policy sees the same pre-observation planned initial room reading, elapsed time, sampling interval, noise specification, occupancy, duct-measurement availability, feasible actions and time cap. For the **nominal** Phase 2 policy the forecast uses explicitly fixed assumptions of 2 h⁻¹, 450 ppm/h/person, 430 ppm true supply, and zero room offset. It applies the existing expected-span objective, followed by its duration and ID tie-break, among feasible interventions. The **robust** policy uses the fixed scenario ensemble and its 0.25 h⁻¹-equivalent penalty per additional hour. Both can extend up to the time cap. The **simple rule** chooses the first feasible action in this order: empty room, longer measurement, higher precision, measured supply, unchanged. The **unchanged** policy keeps the current duration, occupancy and sensors. Every decision precedes generation of the observation traces. The comparison gives all four policies the same hidden conditions and pairs their simulated draws across feasible actions. Only post-decision scoring uses the physical truths.

The two development controls use constant physical settings. The eight evaluation cases have distinct settings and independent seed ranges. Consecutive blocks of 32 seeds begin at 31,000 + 1,000 × development index and 731,000 + 1,000 × evaluation index; indices start at zero within each split. Separate XOR-keyed LCG streams generate room bias, duct bias, sampling jitter and Gaussian noise. Each stream discards eight initial outputs. Room and duct offsets are constant separately drawn errors per trial and can have opposing signs. Precision reduces the random error SD and leaves the offsets in place. For nominal interval $d$ and actual step $h$, AR(1) noise uses correlation $\rho^{h/d}$ and innovation SD $\sigma\sqrt{1-\rho^{2h/d}}$. A jittered internal sample remains within its declared fraction of a nominal interval. Both recording endpoints are fixed.

Exchange and source may switch halfway through the original recording. The single-zone solution integrates exactly across each switch and repeats the cycle when observation is extended. An empty-room action sets generation to zero. Measured supply uses the physical supply plus an independent duct calibration bias. Without a supply measurement, recovery assumes 420 ppm. The initial *observed* planning level is shared across actions. The generating room's physical initial value accounts for the unknown room sensor offset.

## Scoring

Each strategy uses the same Phase 2 profile fitter on its own generated observations. The estimator receives only time, observed room concentrations, occupancy, noise specification and measured or assumed supply. It fits one constant rate and constant source per trial and returns their residual RMSE and the minimum-to-maximum compatible rate span. The tolerance in profile SSE is $4\max(\sigma,1)^2$, even for correlated and misspecified systems. Its finite 0–8 h⁻¹ support can truncate wide ranges.

The scoring targets are **elapsed-time means of the true exchange rate and total source over the selected duration**. For cycling systems this is one explicit physical summary. A least-squares constant fitted to a transient weights times differently and need not converge to this mean, even with perfect measurements. These cases probe that mismatch directly. All extended scenarios here span a whole number of physical cycles. Different policies within each case therefore have the same ACH target. Source MAE is harder to compare across interventions: emptying a room removes the unknown source to be recovered.

Width and error improvements use paired measurements from the same seed and count a change only when its magnitude exceeds $10^{-9}$. Mean rate error is mean absolute error in h⁻¹. “Inside” counts traces whose compatible-span endpoints enclose the target. This is descriptive containment under the stated generator; the spans have no nominal coverage probability. Cases enter each split mean with equal weight. All 32 realizations are present for each case and policy.

## Results

| Split and policy | Traces | Rate MAE (h⁻¹) | Mean span (h⁻¹) | Target inside | Mean duration (min) |
|---|---:|---:|---:|---:|---:|
| Development · unchanged | 64 | 0.256 | 1.408 | 63/64 | 36 |
| Development · nominal | 64 | 0.148 | 0.592 | 62/64 | 72 |
| Development · simple rule | 64 | 0.120 | 0.663 | 62/64 | 52 |
| Development · robust | 64 | 0.080 | 0.740 | 63/64 | 36 |
| Evaluation · unchanged | 256 | 1.533 | 3.727 | 144/256 | 40.25 |
| Evaluation · nominal | 256 | 1.328 | 2.868 | 122/256 | 57.50 |
| Evaluation · simple rule | 256 | 1.116 | 2.827 | 120/256 | 60.00 |
| Evaluation · robust | 256 | 1.106 | 2.887 | 122/256 | 45.25 |

The robust planner averaged 5.00 additional observation minutes relative to unchanged. The simple rule averaged 19.75 additional minutes and achieved a smaller mean span. Compared with the unchanged plan, robust decisions reduced absolute rate error on 128 paired traces, increased it on 41, and left it effectively unchanged on 87. In **32 of 256** paired trials the robust decision narrowed the span and increased absolute rate error. Target containment declined from 144/256 to 122/256. Six of eight cases improved in mean absolute rate error, one worsened, and one tied. The eight heterogeneous scenarios cannot establish a statistically reliable advantage over the simple rule. [Full per-option and per-seed data](../reports/phase3-stress.json)

| Evaluation case | Robust action | Unchanged → robust rate MAE (h⁻¹) | Unchanged → robust span (h⁻¹) | Inside, unchanged → robust, of 32 |
|---|---|---:|---:|---:|
| Fan cycling | Empty | 0.909 → 0.500 | 0.056 → 0.068 | 0 → 0 |
| Changing occupied source | Precision | 1.600 → 1.600 | 0.109 → 0.027 | 0 → 0 |
| Persistent sensor noise | Empty | 0.458 → 0.152 | 1.739 → 0.653 | 28 → 29 |
| Opposed calibration biases | Precision | 0.491 → 0.500 | 0.491 → 0.367 | 0 → 0 |
| Weak empty contrast | Precision | 1.370 → 0.961 | 7.660 → 7.680 | 31 → 32 |
| Drifting source and fan | Empty | 2.853 → 1.353 | 5.602 → 1.196 | 25 → 0 |
| Time-limited occupied survey | Precision | 2.055 → 1.991 | 7.125 → 6.743 | 31 → 31 |
| Outside planning envelope | Longer | 2.528 → 1.789 | 7.033 → 6.365 | 29 → 30 |

Opposing room and supply biases produced the clearest case of harmful narrowing on average: higher precision lowered width by 0.123 h⁻¹ and raised rate MAE by 0.009 h⁻¹. In the jointly varying fan/source case the narrower robust spans missed the target in all 32 trials, even as its point estimates approached the time-average target. Under changing source the robust spans averaged only 0.027 h⁻¹ despite a 1.600 h⁻¹ MAE. An occupancy or control change that violates the fitted dynamics can dominate sensor precision.

## Computational cost

Deterministic operation counts and host timings describe different quantities. A nominal plan evaluates 3–5 expected widths over 483–805 candidate-rate losses on these evaluation cases. A robust plan evaluates 288–1,080 widths over 46,368–173,880 candidate-rate losses. The implementation reuses analytic projections across ensemble worlds with the same duration. The simple rule and unchanged plan each evaluate zero losses. Recovery time is excluded from these planning counts.

On one Linux host with Node v24.22.3 and an AMD EPYC 9V74, case-level median planning times across 11 calls after one warmup ranged from 1.48–9.02 ms for robust and 0.22–0.89 ms for nominal. The simple-rule and unchanged median calls each took under 0.001 ms on this host and timer. Browser scheduling, hardware, grid size and record length matter. The timing file is a separate observation and is omitted from deterministic evidence comparisons. [Timing samples and operation counts](../reports/phase3-stress-timing.json)

## Reproduction and limits

```sh
cd web
npm ci
npx tsx phase3-stress.ts
npm test -- tests/stress.test.ts
npx tsx phase3-stress.ts --timing
```

The study command verifies the frozen protocol digest and writes the detailed JSON and compact UI data. The tests independently regenerate every paired output and compare both released files. The detailed JSON includes the generation settings, seed ranges, input-only rankings and scores, every feasible action, each fitted rate and source, targets, span endpoints, containment and residuals.

This is a fixed stress suite, not a probability sample of buildings. Calibrations, room mixing, control-point dynamics, feasible fresh starting concentrations, operator costs and changes induced by emptying a room remain assumptions. The source/flow cycles are deliberately simple and none of these observations were collected in a building. A held-out prospective field study with measured control transitions and independent calibration is required to judge transportability.
