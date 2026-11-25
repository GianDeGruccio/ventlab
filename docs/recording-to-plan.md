# From a recording to a repeat measurement

Choose a session and occupancy period in **Data explorer** or a custom window in **Blind validation**, then select **Plan my next measurement**. A local CSV uses the same workflow as the bundled recordings. The analysis runs entirely in the browser. Refreshing a planning page clears the window from memory.

| Source | How VentLab uses it |
|---|---|
| Selected observations | The source file, session, inclusive one-based session rows and endpoint timestamps identify the window. The original timestamps, indoor CO₂, counts and any supply CO₂ go to the existing retrospective estimator. Its flags, sensitivity endpoints and abstentions are preserved. |
| Candidate repeat schedule | The first indoor reading, elapsed minutes and median successive time difference initialize the form. The planner assumes a regular future schedule. The original irregular timestamps remain in the recording analysis. Repeating the starting concentration is an assumption about feasibility. |
| Occupancy and duct measurements | A common integer count from zero to four can initialize occupancy. Missing or varying counts require an explicit future count. Supply availability starts enabled only when every selected sample has a positive finite supply reading. Users can change availability for the repeat. The observed duct concentrations never become a known future background. |
| User choices | The user must enter a sensor noise SD. Accuracy specifications and calibration bias cannot supply a repeatability SD without additional information. Future occupancy, schedule, starting reading, availability, action feasibility, maximum duration and extra-time penalty are user choices. A value outside the planner's supported domain stays visible in the observed summary and leaves the corresponding form field blank. |
| Modeled parameters | The fixed prospective ensemble supplies unknown ventilation, generation, background and calibration offsets. The independent stress cases supply the evidence behind the limitations. The readout includes alternative strategies and the smallest modeled gain. |
| Mechanical airflow | Only the existing post-fit reveal reads the reference store. Neither the repeat calculation nor either export reads it. A rate fitted to the historical trace also stays outside the planner. |

## Read and export the result

The observed sensitivity range comes from the decay model's sensor scenarios. A prospective mean width instead summarizes hypothetical repeat measurements across the planner's equal-weight ensemble. A simulated compatible range comes from profiling the generated observations. None has calibrated probability coverage. If sensors disagree systematically, improving random precision can sharpen a biased fit. If occupancy or fan settings change, record the transition times and examine stable windows. One room sensor cannot verify mixing or distinguish all sources.

**Download recording report** saves the selected observations, provenance, inference assumptions, results and flags as readable JSON. **Download experiment report** adds the confirmed repeat inputs, ranked feasible alternatives, selected action, constraints and scoring model. A measured report leaves the after-measurement empty until a new recording exists. Imported files retain their local filename and import role. Missing numeric observations serialize as JSON null. A local export includes the selected samples and may reveal occupancy and timestamps if shared.

In **Experiment designer**, the report uses the last applied configuration and seed. It records simulated samples, known truth, profile estimates, compatible endpoints, boundary diagnostics and recovery errors. The proposed strategy and any executed comparison have separate fields so that a guided intervention remains identifiable. After input edits, apply the new settings before exporting.

## Reproduction

Use the test and build commands in the [README](../README.md). The transfer tests change and reveal the mechanical reference while requiring identical planning inputs, decisions and reports. They also exercise irregular cadence, partial supply, mixed occupancy, short windows and paired synthetic reports. Browser checks exercise both recording entry points, edit the plan, download and parse both kinds of report, and select individual cases in the evidence comparison.

The scientific methods and evidence are versioned separately. [Retrospective inference](science.md) · [Robust objective and ensemble](robust-planning.md) · [Frozen stress protocol and outputs](stress-protocol.md)
