"""Build the readable findings from exactly the same records as the JSON and CSV."""
from .protocol import FLOW, EXTRACT


def fmt(x, digits=2):
    return "—" if x is None else f"{x:.{digits}f}"


def render(audits, metrics, ledger):
    lines = ["# VentLab Phase 1 findings", "", "## Data integrity and sampling", "",
             "All three byte streams passed the publisher's size and MD5 checks. Times below use the source clock. A session here is an uninterrupted one-minute block. Counts of off-cadence steps include short gaps.", "",
             "| File | Dates | Rows | Sessions | Off-cadence steps | Missing cells | Duplicate timestamps beyond first | Negative supply / extract | Supply 0–1 L/s |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for name, a in audits.items():
        missing = sum(c["missing"] for c in a["columns"].values())
        obs = a["observations"]
        lines.append(f"| {name} | {a['time_start'][:10]} to {a['time_end'][:10]} | {a['rows']} | {len(a['sessions'])} | {a['off_cadence_steps']} | {missing} | {a['duplicate_timestamp_rows_beyond_first']} | {obs[FLOW]['negative']} / {obs[EXTRACT]['negative']} | {obs[FLOW]['nonnegative_at_most_1_lps']} |")
    lines.append("")
    for name, a in audits.items():
        obs = a["observations"]
        humidity = obs["Relative Humidity (%)"]["outside_0_to_100"]
        ml_count = obs.get("Occupant count (ML estimate)", {}).get("outside_capacity_or_fractional")
        ml_note = f" The ML count was fractional or outside 0–4 in {ml_count} rows." if ml_count is not None else ""
        lines.append(f"- {name} had {humidity} humidity readings outside 0–100% and {obs[FLOW]['above_upper_outer_fence']} supply readings above its file-specific upper outer fence (Q3 + 3 IQR). High readings are retained for review.{ml_note}")
    lines += ["", "### Observed ranges in source units", "", "| Column | " + " | ".join(audits) + " |",
              "|---|" + "---|" * len(audits)]
    columns = dict.fromkeys(k for a in audits.values() for k in a["columns"] if k != "time")
    for c in columns:
        ranges = []
        for a in audits.values():
            x = a["columns"].get(c)
            ranges.append(f"{fmt(x['min'])} to {fmt(x['max'])}" if x else "absent")
        lines.append("| " + c + " | " + " | ".join(ranges) + " |")
    lines += ["", "## Comparisons with measured mechanical supply", "",
              "Each period has equal weight within its file. Rounded values below come from unrounded window results. Width is the span of the seven fitted sensitivity scenarios. Containment counts only scored windows with a complete span. The two training files are development results. Prior inspection of the test file limits the evaluation to retrospective evidence.", "",
              "| Recording | All periods | Zero-occupancy | Fitted | Pass checks | Scored | MAE (h⁻¹) | MAPE (%), n | Mean width (h⁻¹), n | Reference inside span |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    def metrics_row(label, m):
        return f"| {label} | {m['periods']} | {m['unoccupied']} | {m['estimated']} | {m['status'].get('passes_checks', 0)} | {m['scored']} | {fmt(m['mae_ach'])} | {fmt(m['mape_percent'])}, {m['relative_n']} | {fmt(m['mean_sensitivity_width_ach'])}, {m['sensitivity_n']} | {m['inside_scenario_n']} / {m['scenario_comparable_n']} |"
    header = lines[-2:]
    for name, groups in metrics.items():
        lines.append(metrics_row(name, groups["all"]))
    lines += ["", "### Evaluation by window characteristics", "", *header]
    test = metrics["ventilation_test.csv"]
    for label, m in test.items():
        if label not in ("all", "unoccupied"):
            lines.append(metrics_row(label.replace("_", " "), m))
    lines += ["", "### Conventional baseline on common scored windows", "",
              "| File | Baseline fits / scored | Common scored | Physics MAE (h⁻¹) | Baseline MAE (h⁻¹) |",
              "|---|---:|---:|---:|---:|"]
    for name, groups in metrics.items():
        m = groups["all"]
        lines.append(f"| {name} | {m['baseline_estimated']} / {m['baseline_scored']} | {m['paired_n']} | {fmt(m['paired_physics_mae_ach'])} | {fmt(m['paired_baseline_mae_ach'])} |")
    evaluation = [r for r in ledger if r["role"] == "evaluation"]
    scored = test["all"]
    baseline_failures = {}
    for r in evaluation:
        if r["state"] == "unoccupied" and "baseline_ach" not in r:
            why = r["baseline_status"]
            baseline_failures[why] = baseline_failures.get(why, 0) + 1
    unavailable = sum("rate_ach" in r and "reference_ach" not in r for r in evaluation)
    lines += ["", f"{unavailable} fitted evaluation periods lacked a usable mechanical comparison. Among unoccupied periods the log-linear baseline recorded " +
              (", ".join(f"{n} × {why}" for why, n in baseline_failures.items()) or "zero failures") + ".",
              "", f"The observed fraction of references inside the scenario span was {scored['inside_scenario_n']}/{scored['scenario_comparable_n']}. No target coverage probability was specified. The sample comes from {len(audits['ventilation_test.csv']['sessions'])} sessions in one room."]
    for r in evaluation:
        if r["status"] == "passes_checks" and "reference_ach" in r:
            lines += ["", f"The {r['start']} period passed the checks with an estimate of {fmt(r['rate_ach'])} h⁻¹ and a mechanical reference of {fmt(r['reference_ach'])} h⁻¹. The absolute difference was {fmt(r['abs_error_ach'])} h⁻¹. The scenario span was {fmt(r.get('sensitivity_low_ach'))}–{fmt(r.get('sensitivity_high_ach'))} h⁻¹."]
    lines += ["", "### Every unoccupied evaluation period", "",
              "| Start | min | Result | Fit / mechanical (h⁻¹) | Scenario range (h⁻¹) | Diagnostic flags or abstention |",
              "|---|---:|---|---:|---:|---|"]
    for r in ledger:
        if r["role"] == "evaluation" and r["state"] == "unoccupied":
            flags = ", ".join(r["flags"]) or "none triggered"
            lines.append(f"| {r['start']} | {fmt(r['duration_min'],0)} | {r['status']} | {fmt(r.get('rate_ach'))} / {fmt(r.get('reference_ach'))} ({r['reference_status']}) | {fmt(r.get('sensitivity_low_ach'))} to {fmt(r.get('sensitivity_high_ach'))} | {flags} |")
    lines += ["", "### Abstentions", ""]
    for name, groups in metrics.items():
        reasons = ", ".join(f"{n} {reason.replace('_', ' ')}" for reason, n in groups["all"]["abstention_reasons"].items())
        lines.append(f"- {name} had {reasons or 'zero abstentions'}.")
    lines += ["", "The window ledger includes every occupied period, unavailable comparison, failed baseline and triggered flag. A zero trigger count does not establish reliability. See the scientific notes for the assumptions behind each diagnostic.", ""]
    return "\n".join(lines)
