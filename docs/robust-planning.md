# Robust measurement planning

Given a starting CO₂ reading and an observation protocol, would another measurement still be informative under several different explanations for the room's behavior? The robust planner compares feasible measurements **before observing a synthetic outcome**. Sliders for hidden ventilation, generation, supply concentration, calibration offset and seed control the demonstration and its eventual outcome. The planner reads only the planned starting room reading, occupancy count, total duration, sampling interval, assumed noise standard deviation, availability of a supply measurement, and explicit constraints. The assumed starting reading is treated as the expected room-sensor reading at time zero.

## Finite ensemble

The planner evaluates the full Cartesian product in the table. Each combination receives equal weight as a design convention. These values span different plausible laboratory conditions and are fixed across the study. They have no empirical prevalence or posterior interpretation.

| Factor | Planning values |
|---|---|
| Constant effective air changes per hour | 0.35, 1.25, 2.70, 5.50 h⁻¹ |
| Constant generation per occupant | 0, 450, 900 ppm/h/person; zero if empty |
| True incoming concentration | 370, 430, 490 ppm |
| Additive room-sensor offset | −30, 0, +30 ppm |
| Additive duct-sensor offset | −8, +8 ppm |

An occupied plan has 216 worlds. An empty plan has 72. If supply is unmeasured, the two duct offsets produce the same baseline observation and both stay in the ensemble for paired evaluation of installing a supply sensor. In each world, the physical initial concentration equals the starting room reading minus the world's room offset. The physical source is occupancy times generation per person. The observation protocol and each alternative use the same world. Noise affects the design criterion through the presumed sensor precision. The planning calculation uses expected traces without drawing random noise.

## Computation

The frozen [Phase 2 design study](design-study.md) defines the profile loss. Given candidate rate $k$, elapsed hours $t$, $e=\exp(-kt)$, $\phi=-\operatorname{expm1}(-kt)/k$ (equal to $t$ at zero), and nominal supply $B$, fit the expected observations using

$$y-B=eA+\phi h,\qquad h=G+k(o+B_{\rm true}-B).$$

$A$ is a free start level. Source $G$ ranges from 0 to 1200 ppm/h per occupant. The room offset $o$ ranges over ±30 ppm. For unmeasured supply, $B=420$ ppm with ±75 ppm unknown error. For measured supply, $B$ equals the world's incoming concentration plus its simulated duct offset with ±10 ppm unknown error. These assumptions let several source and offset combinations explain the same trace.

For each $k$ on the Phase 2 0–8 h⁻¹ search grid in 0.05 h⁻¹ steps, minimize squared residuals by profiling over $A$ and the bounded effective source $h$. Compatible rates have loss at most $4\max(\sigma,1\,\mathrm{ppm})^2$ above the best fit. Interpolate crossings between rate samples and report the largest compatible rate minus the smallest. Search endpoints can truncate this span. A narrower span measures compatibility under the assumed model and noise scale. It does not establish smaller rate error or a confidence level.

To control browser workload, the implementation uses the fact that a constant-rate world's expected trace minus nominal supply has the form $a+b\exp(-rt)$ for a known **ensemble** rate $r$. Precompute the least-squares projection and squared residual of each of the four unit exponential shapes onto $e,\phi$ at every candidate rate for each proposed schedule. The constant term has an exact representation because $e+k\phi=1$. Scaling these projections and applying the nuisance bounds gives the same candidate losses as fitting the expected trace sample by sample. No estimated values are substituted from the hidden synthetic case. At most two schedules, 216 worlds, five plans, 161 tested rates and 1,921 sample times per schedule are needed per decision. An automated test compares the optimized baseline and measured-supply summaries against direct fits of every expected trace in a 216-world ensemble.

## Decision rule and constraints

For world $j$ and option $a$, define paired reduction $D_{ja}=W_{j,\rm baseline}-W_{ja}$ in h⁻¹. For each option report mean and largest width, mean paired reduction and the smallest paired reduction. The minimum reduction can be negative when the measurement worsens identifiability in one world, even if it helps on average.

$$S_a=0.5\,\mathrm{mean}_j(D_{ja})+0.5\,\min_j(D_{ja})-\lambda(T_a-T_0)/60.$$

The time budget $T$ is in minutes. The default penalty $\lambda=0.25$ h⁻¹ equivalent per extra observation hour makes the time tradeoff explicit. Both the half-weight on worst-case gain and the time penalty are design preferences. Hardware costs, staff time and the nuisance of vacating a room are not known. Users can disable unavailable strategies and change the time budget or penalty. A cap below the starting measurement duration is infeasible.

| Option | Modification to the observation |
|---|---|
| Keep current measurement | Always feasible, zero gain and penalty |
| Extend the observation | Double duration, limited by the total time cap; omit if already at the cap |
| Halve sensor noise | Halve random error SD if eligible and current SD exceeds 1 ppm; retain the calibration range |
| Measure supply CO₂ | Use a duct reading if available and supply was previously assumed |
| Observe an empty room | Remove the source if occupancy is positive and room access permits |

Choose the feasible option with the largest score. For deterministic ties, compare scores rounded to nine decimal places in h⁻¹ equivalent units, prefer the current protocol, then shorter duration, then option ID. An inadequate or zero gain can therefore keep the current measurement. Under the model the interventions hold initial reading, ventilation and supply constant across protocols. In an actual building, vacating the room can change a demand-controlled ventilation rate.

## Interpretation

The worst-case calculation covers only this finite grid. There may be worse settings between its points or outside its bounds. It assumes a well-mixed room, constant rate and source, time-invariant offsets and a known sampling protocol. A rounded grid, bounded nuisance terms, insufficient contrast, varying sources and inaccurate background assumptions can all affect the recommendation. The robust planner is a prospective policy evaluated using synthetic experiments; the real-data mechanical-flow comparisons remain retrospective.
