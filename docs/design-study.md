# Prospective measurement design

The Experiment Designer asks which measurement would make two ventilation rates easier to distinguish **if the proposed experiment behaves as specified**. The operator chooses a rate and source to generate synthetic observations. These known settings allow experimental planning and recovery checks. The estimator used in the retrospective Blind Validation Lab continues to abstain on occupied periods. Occupied synthetic experiments here place a much stronger assumption on generation: a constant but unknown total source over the entire observation.

## Simulated record

For time $t$ in hours, effective rate $k$ in h⁻¹, incoming concentration $B$ in ppm and total source $G$ in ppm/h, the concentration is

$$C(t)=C_0+\phi(t)[k(B-C_0)+G],\qquad \phi(t)=-\operatorname{expm1}(-kt)/k.$$

At zero ventilation, $\phi(t)=t$. The source equals occupant count times the selected per-person generation in ppm/h/person **for this room volume**. Values in ppm/h are concentration production rates normalized by room volume. Individual metabolic emission measurements normally require volume conversion before using this parameterization.

The UI uses minutes for sampling and elapsed time. The final sample is included even when the sampling interval does not divide the duration. Each observation adds a constant room offset plus independent zero-mean Gaussian noise at the selected standard deviation. A uint32 linear congruential generator and Box–Muller transform make the draws reproducible. Changing the seed changes only the random noise. A common seed couples the standard-normal draws across prospective interventions. Doubling duration retains the shared observations when sample times coincide.

## Residual map and demonstration

The colors show sample RMSE in ppm at each candidate $(k,G)$ on a 41-by-33 display grid. Every cell fits its own starting concentration by ordinary least squares. It conditions on zero offset and the nominal supply concentration. Measured supply uses the selected true supply as its nominal value. Assumed supply uses 420 ppm, which can differ from the simulated true value. The map includes hypothetical occupied sources when the empty-room constraint is selected so the viewer can see what excluding them accomplishes. The fitted and alternative trajectories enforce zero generation for empty occupancy.

The point estimator searches 0–8 h⁻¹ on a finer 0.05 h⁻¹ grid and fits generation continuously at each rate. For occupancy count $n$, constrain $G$ to $[0,1200n]$ ppm/h. This range defines a synthetic source bound, independent of the simulated per-person setting. The plotted alternative chooses the lowest-RMSE candidate at least 0.75 h⁻¹ away from the configured true rate; its generation and starting level are refit. Its RMSE is against the **observations**. A distinguishing gap can be visible or imperceptible depending on settings. The deliberate separation from a known true rate belongs only to the teaching comparison.

## Ranking

The candidate interventions start at the same physical initial concentration and rate as the original experiment. Each intervention models a new experiment with one change.

- **Extend the observation** doubles duration up to 480 minutes.
- **Halve sensor noise** halves random noise while retaining calibration bounds.
- **Measure supply CO₂** uses the configured true supply as nominal and reduces assumed supply calibration uncertainty from ±75 to ±10 ppm.
- **Observe an empty room** sets count and generation to zero. This assumes occupancy can be controlled without changing ventilation or initial concentration.

The planning criterion uses the expected concentration trace including the configured room bias, before drawing random noise. For each candidate rate it profiles over the unknown initial level, source, incoming CO₂ error and room offset. The room offset can range over ±30 ppm. Let $b$ be nominal supply, $o$ the room offset, $e=\exp(-kt)$, and $A$ the observed initial level minus $b$. Then

$$y-b=eA+\phi h,\qquad h=G+k(o+B-b).$$

With a constant source, room offset and supply error, these nuisance terms can be profiled together. Compute least-squares $A$ analytically at every $h$. The remaining loss is quadratic in $h$. Minimize it over $[-k\delta,1200n+k\delta]$ for $\delta=30+10$ ppm with measured supply or $30+75$ ppm with assumed supply. Large true offsets are allowed in stress scenarios even if they violate these assumed bounds.

The compatible set includes rates whose profiled sum of squared residuals increases by at most $4\max(\sigma,1\,\mathrm{ppm})^2$ above the best fit. A 1 ppm floor represents a chosen planning resolution. Rates are sampled on the fine grid and the planning pass also evaluates the proposed true rate. Boundary crossings are linearly interpolated in loss between neighboring rate samples. The **width** spans the lowest to highest compatible rate within the finite search range. Search-edge limits can truncate the result.

This is an expected-trace distinguishability score. For fixed competing mean trajectories and iid Gaussian errors of equal variance, the expected increase in squared residual sum equals the squared distance between their means. Profiling nuisance parameters against a noiseless mean trace approximates this separation. Random data optimization, boundary effects and parameter misspecification can change the realized ranking. The threshold is a design convention. Neither this width nor the Phase 1 sensitivity span has a calibrated confidence level, and the two are computed differently.

Rank by the largest difference between the current and proposed expected-trace widths in h⁻¹. Break exact ties by shorter total observation time and then strategy ID. The interface reports time to make the longer-observation tradeoff explicit. The score assumes access to the proposed sensors and room, and assigns no currency cost. It does not estimate the chance that a given field measurement will succeed. A high-confidence operational recommendation would need independent prospective validation.

## Seeded benchmark

Run `cd web && npm run benchmark` to regenerate [the machine-readable study](../reports/phase2-synthetic.json). It includes all case parameters, first seeds, intervention-level rate and total-source MAE, mean compatible width, true-rate containment counts, boundary fits and RMSE. In each case, prediction ranks the interventions from the expected trace before 32 paired random-noise trials assess their realized average width. Compare the ranking with the alternative having the smallest realized mean width. The full noise realizations are reproducible from consecutive integer seeds.

Three development designs use first seeds 1000, 2000 and 3000. Six separately specified evaluation designs use first seeds 100000 through 105000 in increments of 1000. The evaluation includes two low-contrast cases and a deliberate calibration stress case. Parameter choices, model family, rate search and intervention list are fixed across both splits. The two splits share the same generative model. This synthetic study cannot establish transfer to a building with time-varying sources, correlated noise or spatial gradients.

| Metric | Development · 96 trials | Evaluation · 192 trials |
|---|---:|---:|
| Recommended option achieved smallest realized mean width | 3/3 scenarios | 4/6 scenarios |
| Mean width decreased | 3/3 scenarios | 6/6 scenarios |
| Mean rate error decreased | 2/3 scenarios | 5/6 scenarios |
| Rate MAE, current → recommended (h⁻¹) | 0.458 → 0.073 | 1.071 → 0.392 |
| Mean compatible width, current → recommended (h⁻¹) | 1.399 → 0.492 | 4.091 → 2.317 |
| True rate inside observed span, current → recommended | 92 → 91 | 159 → 152 |
| Baseline total-source MAE (ppm/h) | 395.9 | 306.4 |

| Evaluation case | Recommended | Minimum observed mean width | Baseline → recommended rate MAE (h⁻¹) |
|---|---|---|---:|
| Slow occupied transient | Empty room | Empty room | 0.552 → 0.047 |
| Near steady state | Empty room | Empty room | 2.198 → 0.191 |
| Fast empty decay | Longer | Longer | 0.043 → 0.034 |
| Weak empty contrast | Higher precision | Longer | 1.389 → 0.793 |
| Strong source, short record | Longer | Longer | 1.519 → 0.558 |
| Background/calibration stress | Higher precision | Longer | 0.726 → 0.731 |

In the stress case, true supply is 560 ppm and true room bias is +65 ppm. Both exceed their assumed calibration ranges in the baseline. Halving random noise narrowed the average span by 0.081 h⁻¹ while increasing rate MAE. The original and recommended spans each missed the true rate in all 32 trials. For weak empty contrast, the recommendation left an extra 0.096 h⁻¹ of average width relative to the empirically best tested option. These are actual failures of the simulation-based recommendation criterion.
