# Scientific protocol and interpretation

## Experiment and provenance

Julius Mikala, Yinda Xu and Matti Huotari published *Indoor occupancy ground truth dataset with variable ventilation*, version 1.0, on January 19, 2026. The reported dimensions of the simulated Finnish office are 2.69 m high × 2.71 m wide × 3.00 m long. Their product gives **21.8697 m³**, a geometric approximation to the effective mixed volume. The room accommodated up to four people. The variable-air-volume system used equal supply and exhaust **setpoints**. Its actual flows were measured separately. The indoor sensor was at 1.75 m. The source reports ±30 ppm accuracy for room CO₂, ±40 ppm + 3% for duct CO₂ and ±5% for the airflow meter. These are instrument specifications. The record gives no probability distribution for their errors. [Original dataset and experimental metadata](https://zenodo.org/records/18299691)

The early training period spans February 2024 to March 2025 and used camera-based occupancy counts. The room was renovated after March 2025. The October–November 2025 training and test files have manually recorded occupancy and measured duct supply/exhaust CO₂. The additional ML count is an estimate. Only the recorded occupant-count column determines occupancy state. The source describes training under several control strategies. It describes the test strategy as a 3 L/s base plus 6 L/s per detected occupant, updated every five minutes. These commands never enter the model, and scheduled setpoints cannot establish that flow stayed constant. Timestamp timezone and alignment within the reported minute are unspecified. [Experimental setup](https://zenodo.org/records/18299691)

Each original is preserved byte-for-byte. The acquisition fallback was necessary because the mounted workspace lacked the three root files. To recover a missing file, use its `links.self` URL in the saved record and verify its size and checksum before using it. Auditing runs on copies read into memory. It counts missing and nonfinite cells, timestamp duplicates/invalid values/reversals and off-cadence steps, reports column ranges and tracks physical outliers. The upper airflow screening fence is the file's third quartile plus three interquartile ranges. Several control regimes can create a broad distribution. The fence locates observations for review and has no role in estimation or scoring.

## CO₂ balance, propagation and fit

Let $C$ be room CO₂ (ppm by volume), $B$ incoming air CO₂ (ppm), $V$ the mixed volume (m³), and $Q$ an equivalent incoming flow (m³/h). A single, instantaneously mixed zone exhausts at room concentration and has constant volume. With time in hours, conservation of CO₂ gives

$$
  \frac{dC}{dt}=k(B-C)+s,\qquad k=Q/V,\qquad s=10^6 G/V.
$$

Here $G$ is pure CO₂ generation in m³/h at compatible conditions. For $G$ in L/s, first multiply by 3.6. A zero occupant count is taken to imply $s=0$. The forward API also accepts prescribed generation in ppm/h. Its value can vary per interval. The field evaluation never assumes a per-person generation rate. The single-inlet model approximates all exchange with the measured supply concentration or a stated background. Mixing, infiltration with a different background, time misalignment and changing generation can break that approximation. [Batterman, 2017, review of CO₂-based ventilation methods](https://doi.org/10.3390/ijerph14020145)

For the interval from sample $i$ to $i+1$, convert its seconds to hours $h_i$. Hold $B_i$ and $s_i$ at their left endpoint and use one rate $k$ over the window. The exact interval update is

$$
  w_i=-\operatorname{expm1}(-k h_i),\qquad
  C_{i+1}=C_i+w_i(B_i-C_i)+s_i\,w_i/k.
$$

At $k=0$ the source integral is $s_i h_i$. For $kh_i\le10^{-8}$, the source factor uses $h_i(1-kh_i/2)$, whose leading omitted relative term is $(kh_i)^2/6$. The mixing weight uses `expm1` throughout. The final supply/source sample labels the end of observation and has no following interval. Internal numerical timestamps must be finite and strictly increasing. Positive CO₂, nonnegative finite rates and nonnegative specified generation are required.

Fix the initial room concentration at its first observed value. For each candidate rate, propagate the entire trajectory without resetting to later observations. Minimize the equally weighted sum of squared ppm residuals over the remaining observations (equivalently their mean). Samples represent observed concentrations, with one residual per timestamp. The field data within a session are equally spaced. The solver evaluates 31 equally spaced rates from 0 to 30 h⁻¹, refines the neighborhoods of sampled local minima with bounded scalar minimization, and explicitly compares endpoints. A flat objective produces abstention. An endpoint optimum is reported and flagged. The upper limit is a computational choice, which can truncate a sensitivity range. The grid search is an approximation for general time-varying forcings. Conditioning on the first observation, time-correlated residuals and misspecified forcing limit statistical interpretation.

For conventional unoccupied decay at a constant background and positive excess,

$$
  \log(C_i-B)=a-k t_i.
$$

The baseline fits an intercept and slope by ordinary least squares in elapsed hours. It rejects nonpositive excess and a non-declining log trend. It uses the same window and a constant background equal to the left-held time average of measured supply, or 420 ppm in the early file. Consequently the two estimators assign different influence to early and late observations. The baseline has its own failure counts. Common-window comparisons use the intersection of scored estimates.

## What can the record identify?

With known $B$ and $s$, ideal continuously observed $C$ identifies a constant $k=(dC/dt-s)/(B-C)$ wherever the denominator is nonzero. If the room stays at the supply concentration and generation is zero, every rate generates the same trajectory. An unrestricted unknown source can reproduce a given trajectory at different rates by setting $s(t)=dC/dt-k(B-C)$. Physical constraints on the source can narrow that set. Occupancy count alone does not supply the missing generation function. This is structural ambiguity. Inferring both a constant source and rate from a sufficiently excited transient is a different problem. VentLab abstains on occupied or unknown-occupancy runs.

Even a structurally identifiable rate can be weakly estimated from noisy, short or nearly flat records. For constant background, no source and known initial concentration, $\partial C(t)/\partial k=-t(C_0-B)e^{-kt}$. Small initial excess or short observation time reduces the change in concentration produced by a change in rate. A small residual alone can therefore accompany a poorly constrained rate.

## Periods, diagnostics and sensitivity

Time order is the original row order. For these nominal one-minute files a new operational session begins at every interval other than 60 s, including clock reversal, duplicate time, missing time or gap. Actual experimental session identifiers are unavailable. This conservative choice can subdivide a single laboratory visit. No interpolation bridges gaps. Within each session use every maximal run with the same occupancy state (zero, positive or unknown). Positive-count changes stay within the occupied run. Changes outside that run never enter either adjoining decay. No decaying trend, airflow level or post-hoc best subwindow is required to become a candidate.

The model attempts every valid zero-count run spanning at least 10 minutes. The provisional checks below are engineering thresholds set independently of the reference. They have no assigned sensitivity or specificity.

| Check | Rule or action |
|---|---|
| Unknown generation | Abstain on positive, missing, fractional, negative or over-capacity occupancy. Abstain on invalid room or measured supply observations. |
| Background missing from file | Set 420 ppm, flag the assumption and stress it by ±50 ppm. A corrupt value in a measured duct series triggers abstention. |
| Duration | Abstain under 10 min. Flag under 20 min and fitted exposure $kT<0.25$ with $T$ in hours. |
| Signal | Flag room range ≤60 ppm, net room drop ≤0, or absolute room–supply contrast within the sum of the room and background perturbations at every timestamp. |
| Model fit | Flag trajectory RMSE >30 ppm over observations after the initial sample. This threshold uses the stated room accuracy as a scale. |
| Parameter sensitivity | Refit the nominal and six scenarios below. Flag a span wider than the greater of 1 h⁻¹ and half the nominal rate. Flag any rate within $10^{-6}$ h⁻¹ of a search bound or an incomplete scenario set. |
| Changing rate | Split once at the temporal midpoint (first timestamp at or after it belongs to both halves as the shared endpoint). Fit each half separately if both span ≥10 min and both room ranges exceed 60 ppm. Flag an absolute rate difference exceeding the greater of 1 h⁻¹ and half the full rate. Store an explicit unavailable status when the comparison lacks signal. |

Each fit's seven scenarios comprise nominal, four sign combinations of coherent room/supply offsets, and two room drift cases with nominal supply. The indoor offset is ±30 ppm. The measured supply offset at each time is ±(40 + 0.03 B) ppm with one sign throughout the run. In the early file only, supply varies from the nominal 420 by ±50 ppm across scenarios. The drift stress linearly changes the room perturbation from −30 to +30 ppm or in reverse. The initial room observation moves with the scenario. The span encloses these **specific refits**. Offset signs need not represent equally likely errors. Drift is a stress assumption. Neither these seven paths nor the capped search guarantee coverage of every plausible trajectory. An incomplete set leaves the width undefined. No likelihood, posterior, calibrated confidence level or probabilistic reference-coverage claim is attached.

A fit with warnings is kept for inspection and scored when a reference exists. “Passes checks” means no implemented warning triggered. An unavailable half-window diagnostic is explicitly recorded and leaves constant-rate behavior unverified. The flags cannot establish calibration, source validity or external reliability. To improve a weak record, the relevant measurement depends on the failure: a longer unoccupied observation with detectable room–supply contrast for weak excitation, simultaneous duct CO₂ when background is assumed, independent source information for occupied periods, or synchronized spatial room measurements and control-state records when a single-rate fit breaks down.

## Reference and metrics

The fitting path reads only timestamps, actual occupancy, room CO₂ and supply CO₂ if present. No supply/extract airflow, exhaust CO₂, estimated occupancy, control setpoints or reference-derived selection enters prediction. All three prediction sets are completed before scoring. Whole files determine the development/evaluation split, and their date ranges are checked for overlap. Both training files remain distinct development cohorts. The later ventilation test file was previously inspected and supplies a **retrospective** evaluation. The fixed protocol is not a prospective preregistration.

On each already-defined window, time-weight the measured supply L/s with trapezoids between its sample timestamps. Report $k_{\rm mech}=3.6\,\bar Q_{\rm L/s}/21.8697$ h⁻¹. A single negative or nonfinite supply value makes the whole mechanical comparison unavailable. Such a window retains its fit. No clipping, interpolation or selective deletion is applied. Extract airflow and humidity are audit channels. Positive high-flow values remain visible because their validity cannot be established from this dataset. A nonnegative mean ≤1 L/s (about 0.165 h⁻¹) permits an absolute comparison only. The threshold is a denominator safeguard, not a published detection limit. The nominal ±5% meter specification excludes unknown low-flow offsets, synchronization and mixed-volume error. The discrepancy between effective removal and mechanical supply is therefore a comparison between two different physical measurements.

Per file and subgroup, report mean absolute error, mean signed error (fit minus reference), mean absolute percentage error for usable denominators, mean sensitivity width over complete fits, and the count/fraction of available point references within their scenario spans. The CSV preserves individual signed and absolute errors, relative errors, reference status and the baseline results. Metrics weight windows equally. They do not assign independent statistical replicates to individual sensor minutes or infer a population error distribution from three test sessions. A session's results may be correlated through operating conditions. Rate variation, background mismatch and an imperfect reference can all contribute to discrepancies. Their individual contributions are unresolved.

## Porting and validation

Port `simulate`, `fit_rate` and `log_decay` first. Inputs are plain numeric sequences with times in seconds and the rates in h⁻¹. Preserve the left-endpoint convention, endpoint candidates, zero-rate limit, cap and invalid-input behavior. The Python tests contain shared analytic trajectories, including a varying-supply two-step case with exact outputs of 500 and 650 ppm. They also compare against an independently integrated ODE with changing supply and generation. Compare TypeScript with mixed absolute/relative tolerances, keeping numerical solver tolerance separate from sensor uncertainty.

A fresh evaluation should reserve complete, previously unseen sessions, record ventilation-control changes and synchronize calibrated room, supply and reference measurements. Estimate sensor offsets and repeatability independently. Compare baseline and physics methods on the same windows, count abstentions, and test whether the diagnostics predict smaller errors. Establish coverage empirically under a stated error model before attaching any probability to an interval.
