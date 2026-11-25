# VentLab Phase 1 findings

## Data integrity and sampling

All three byte streams passed the publisher's size and MD5 checks. Times below use the source clock. A session here is an uninterrupted one-minute block. Counts of off-cadence steps include short gaps.

| File | Dates | Rows | Sessions | Off-cadence steps | Missing cells | Duplicate timestamps beyond first | Negative supply / extract | Supply 0–1 L/s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| training_data_1.csv | 2024-02-28 to 2025-03-25 | 8444 | 51 | 50 | 0 | 0 | 52 / 25 | 27 |
| training_data_2.csv | 2025-10-13 to 2025-11-20 | 4089 | 13 | 12 | 0 | 0 | 47 / 4 | 29 |
| ventilation_test.csv | 2025-11-24 to 2025-11-27 | 1430 | 3 | 2 | 0 | 0 | 14 / 12 | 1 |

- training_data_1.csv had 1 humidity readings outside 0–100% and 191 supply readings above its file-specific upper outer fence (Q3 + 3 IQR). High readings are retained for review.
- training_data_2.csv had 0 humidity readings outside 0–100% and 0 supply readings above its file-specific upper outer fence (Q3 + 3 IQR). High readings are retained for review. The ML count was fractional or outside 0–4 in 222 rows.
- ventilation_test.csv had 0 humidity readings outside 0–100% and 2 supply readings above its file-specific upper outer fence (Q3 + 3 IQR). High readings are retained for review. The ML count was fractional or outside 0–4 in 0 rows.

### Observed ranges in source units

| Column | training_data_1.csv | training_data_2.csv | ventilation_test.csv |
|---|---|---|---|
| Room CO2 (ppm) | 410.50 to 1622.98 | 426.99 to 1727.97 | 427.99 to 1419.98 |
| Temperature (°C) | 19.59 to 23.13 | 19.70 to 22.01 | 19.66 to 22.43 |
| Relative Humidity (%) | 18.21 to 665.99 | 28.99 to 52.45 | 24.13 to 38.67 |
| Pressure (mbar) | 984.50 to 1051.22 | 986.65 to 1013.15 | 998.63 to 1012.69 |
| Supply airflow (l/s) | -6.40 to 362.36 | -4.17 to 66.01 | -0.44 to 64.95 |
| Extract airflow (l/s) | -0.63 to 173.01 | -0.07 to 58.31 | -0.59 to 58.36 |
| Occupant count | 0.00 to 4.00 | 0.00 to 4.00 | 0.00 to 4.00 |
| Supply air CO2 (ppm) | absent | 403.00 to 564.00 | 405.00 to 494.00 |
| Exhaust air CO2 (ppm) | absent | 398.00 to 1646.00 | 410.00 to 1410.00 |
| Occupant count (ML estimate) | absent | 0.00 to 6.00 | 0.00 to 4.00 |

## Comparisons with measured mechanical supply

Each period has equal weight within its file. Rounded values below come from unrounded window results. Width is the span of the seven fitted sensitivity scenarios. Containment counts only scored windows with a complete span. The two training files are development results. Prior inspection of the test file limits the evaluation to retrospective evidence.

| Recording | All periods | Zero-occupancy | Fitted | Pass checks | Scored | MAE (h⁻¹) | MAPE (%), n | Mean width (h⁻¹), n | Reference inside span |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| training_data_1.csv | 239 | 137 | 92 | 0 | 83 | 2.20 | 74.38, 83 | 8.84, 92 | 49 / 83 |
| training_data_2.csv | 80 | 46 | 32 | 3 | 26 | 1.44 | 46.91, 26 | 8.12, 32 | 18 / 26 |
| ventilation_test.csv | 21 | 12 | 12 | 1 | 10 | 0.72 | 66.06, 10 | 5.52, 12 | 4 / 10 |

### Evaluation by window characteristics

| Recording | All periods | Zero-occupancy | Fitted | Pass checks | Scored | MAE (h⁻¹) | MAPE (%), n | Mean width (h⁻¹), n | Reference inside span |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| duration under 20 min | 2 | 2 | 2 | 0 | 2 | 0.84 | 64.86, 2 | 1.26, 2 | 1 / 2 |
| duration at least 20 min | 10 | 10 | 10 | 1 | 8 | 0.69 | 66.36, 8 | 6.37, 10 | 3 / 8 |
| span at most 60 ppm | 3 | 3 | 3 | 0 | 1 | 1.04 | 100.00, 1 | 18.78, 3 | 1 / 1 |
| span above 60 ppm | 9 | 9 | 9 | 1 | 9 | 0.68 | 62.28, 9 | 1.10, 9 | 3 / 9 |
| passes checks | 1 | 1 | 1 | 1 | 1 | 0.40 | 50.31, 1 | 0.78, 1 | 0 / 1 |
| flagged | 11 | 11 | 11 | 0 | 9 | 0.75 | 67.81, 9 | 5.95, 11 | 4 / 9 |
| session 1 | 5 | 3 | 3 | 0 | 2 | 0.43 | 45.30, 2 | 10.45, 3 | 1 / 2 |
| session 2 | 11 | 6 | 6 | 1 | 6 | 0.70 | 66.57, 6 | 4.45, 6 | 3 / 6 |
| session 3 | 5 | 3 | 3 | 0 | 2 | 1.04 | 85.27, 2 | 2.73, 3 | 0 / 2 |

### Conventional baseline on common scored windows

| File | Baseline fits / scored | Common scored | Physics MAE (h⁻¹) | Baseline MAE (h⁻¹) |
|---|---:|---:|---:|---:|
| training_data_1.csv | 71 / 65 | 65 | 1.99 | 1.89 |
| training_data_2.csv | 27 / 23 | 23 | 1.27 | 1.35 |
| ventilation_test.csv | 9 / 9 | 9 | 0.68 | 0.38 |

2 fitted evaluation periods lacked a usable mechanical comparison. Among unoccupied periods the log-linear baseline recorded 2 × no declining log trend, 1 × nonpositive excess.

The observed fraction of references inside the scenario span was 4/10. No target coverage probability was specified. The sample comes from 3 sessions in one room.

The 2025-11-25 08:31:00 period passed the checks with an estimate of 1.20 h⁻¹ and a mechanical reference of 0.80 h⁻¹. The absolute difference was 0.40 h⁻¹. The scenario span was 0.92–1.70 h⁻¹.

### Every unoccupied evaluation period

| Start | min | Result | Fit / mechanical (h⁻¹) | Scenario range (h⁻¹) | Diagnostic flags or abstention |
|---|---:|---|---:|---:|---|
| 2025-11-24 06:42:00 | 50 | flagged | 0.00 / — (negative_flow) | 0.00 to 30.00 | low_variation, weak_room_supply_contrast, no_net_decay, nominal_rate_at_bound, short_relative_to_time_constant, parameter_sensitive, scenario_at_bound |
| 2025-11-24 09:31:00 | 32 | flagged | 1.51 / 1.30 (usable) | 1.27 to 1.86 | large_fit_residual |
| 2025-11-24 13:58:00 | 36 | flagged | 1.53 / 0.88 (usable) | 1.24 to 2.02 | large_fit_residual |
| 2025-11-25 06:10:00 | 26 | flagged | 0.00 / 1.04 (usable) | 0.00 to 21.07 | low_variation, weak_room_supply_contrast, no_net_decay, nominal_rate_at_bound, short_relative_to_time_constant, parameter_sensitive, scenario_at_bound |
| 2025-11-25 07:15:00 | 10 | flagged | 2.05 / 1.58 (usable) | 1.01 to 3.07 | short_duration, parameter_sensitive |
| 2025-11-25 07:31:00 | 11 | flagged | 0.00 / 1.20 (usable) | 0.00 to 0.47 | short_duration, nominal_rate_at_bound, short_relative_to_time_constant, scenario_at_bound |
| 2025-11-25 08:31:00 | 80 | passes_checks | 1.20 / 0.80 (usable) | 0.92 to 1.70 | none triggered |
| 2025-11-25 12:09:00 | 76 | flagged | 0.97 / 0.80 (usable) | 0.75 to 1.36 | large_fit_residual |
| 2025-11-25 13:37:00 | 36 | flagged | 1.87 / 0.95 (usable) | 1.36 to 3.05 | large_fit_residual, parameter_sensitive |
| 2025-11-27 06:08:00 | 100 | flagged | 5.28 / — (negative_flow) | 0.00 to 5.28 | low_variation, weak_room_supply_contrast, no_net_decay, parameter_sensitive, scenario_at_bound |
| 2025-11-27 09:37:00 | 59 | flagged | 2.06 / 1.43 (usable) | 1.65 to 2.78 | large_fit_residual, parameter_sensitive, possible_rate_change |
| 2025-11-27 12:55:00 | 65 | flagged | 2.61 / 1.15 (usable) | 1.99 to 3.77 | large_fit_residual, parameter_sensitive, possible_rate_change |

### Abstentions

- training_data_1.csv had 102 unknown generation, 45 under minimum duration.
- training_data_2.csv had 34 unknown generation, 14 under minimum duration.
- ventilation_test.csv had 9 unknown generation.

The window ledger includes every occupied period, unavailable comparison, failed baseline and triggered flag. A zero trigger count does not establish reliability. See the scientific notes for the assumptions behind each diagnostic.
