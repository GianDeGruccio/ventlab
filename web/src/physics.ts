/** Single-zone CO₂ balance. Times are seconds, exchange is h⁻¹ and source is ppm/h. */
type Series = number | readonly number[];
export interface WindowInput {
  timeS: readonly number[];
  room: readonly number[];
  supply?: readonly number[];
  occupancy: readonly number[];
}
export interface InferenceResult {
  status: 'passes_checks' | 'flagged' | 'abstained';
  reason: string;
  flags: string[];
  baseline_status: string;
  room_span_ppm?: number;
  room_drop_ppm?: number;
  initial_excess_ppm?: number;
  baseline_ach?: number;
  rate_ach?: number;
  rmse_ppm?: number;
  scenario_rates?: Record<string, number | null>;
  sensitivity_low_ach?: number;
  sensitivity_high_ach?: number;
  sensitivity_width_ach?: number;
  first_half_ach?: number;
  second_half_ach?: number;
  rate_change_check?: string;
}
const MAX_RATE = 30;
const ROOM_ACCURACY = 30;
const BACKGROUND = 420;

function steps(t: readonly number[]): number[] {
  if (t.length < 2 || !t.every(Number.isFinite)) throw new RangeError('need at least two finite timestamps');
  const dt = t.slice(1).map((next, i) => (next - t[i]) / 3600);
  if (!dt.every(h => Number.isFinite(h) && h > 0)) throw new RangeError('times must increase strictly');
  return dt;
}

function series(values: Series, n: number, positive: boolean, name: string): readonly number[] {
  const a = typeof values === 'number' ? Array<number>(n).fill(values) : values;
  if (a.length !== n || !a.every(Number.isFinite)) throw new RangeError('invalid shape or nonfinite ' + name);
  if (a.some(x => positive ? x <= 0 : x < 0)) throw new RangeError('invalid ' + name);
  return a;
}

/** Piecewise-constant left-endpoint forcing. The small-exposure branch also handles k=0. */
function trajectory(dt: number[], initial: number, b: readonly number[], k: number, g: readonly number[]) {
  const out = [initial];
  for (let i = 0; i < dt.length; i++) {
    const exposure = k * dt[i];
    const weight = -Math.expm1(-exposure);
    const sourceHours = exposure > 1e-8 ? weight / k : dt[i] * (1 - 0.5 * exposure);
    const next = out[i] + weight * (b[i] - out[i]) + g[i] * sourceHours;
    if (!Number.isFinite(next)) throw new RangeError('nonfinite simulated concentration');
    out.push(next);
  }
  return out;
}

export function simulate(timeS: readonly number[], initial: number, supply: Series, rate: number, generation: Series = 0): number[] {
  const dt = steps(timeS);
  if (!Number.isFinite(initial) || initial <= 0) throw new RangeError('initial CO2 must be positive');
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError('rate must be finite and nonnegative');
  return trajectory(dt, initial, series(supply, timeS.length, true, 'supply CO2'), rate,
    series(generation, timeS.length, false, 'generation'));
}

interface Minimum {rate: number; mse: number}

/** Bounded golden-section minimization within a local grid bracket. */
function minimize(loss: (k: number) => number, lo: number, hi: number): Minimum {
  const fraction = (Math.sqrt(5) - 1) / 2;
  let left = hi - fraction * (hi - lo);
  let right = lo + fraction * (hi - lo);
  let fLeft = loss(left);
  let fRight = loss(right);
  for (let i = 0; i < 128 && hi - lo > 1e-9; i++) {
    if (fLeft <= fRight) {
      hi = right;
      right = left;
      fRight = fLeft;
      left = hi - fraction * (hi - lo);
      fLeft = loss(left);
    } else {
      lo = left;
      left = right;
      fLeft = fRight;
      right = lo + fraction * (hi - lo);
      fRight = loss(right);
    }
  }
  return fLeft <= fRight ? {rate: left, mse: fLeft} : {rate: right, mse: fRight};
}

export function fitRate(timeS: readonly number[], room: readonly number[], supply: Series,
  generation: Series = 0, maxRate = MAX_RATE): {rate: number; rmse: number} {
  const dt = steps(timeS);
  if (!Number.isFinite(maxRate) || maxRate <= 0) throw new RangeError('max_rate must be positive and finite');
  const n = timeS.length;
  const c = series(room, n, true, 'room CO2');
  const b = series(supply, n, true, 'supply CO2');
  const g = series(generation, n, false, 'generation');
  const loss = (k: number) => {
    const pred = trajectory(dt, c[0], b, k, g);
    let squared = 0;
    for (let i = 1; i < n; i++) squared += (pred[i] - c[i]) ** 2;
    return squared / (n - 1);
  };
  const grid = Array.from({length: 31}, (_, i) => maxRate * (i / 30));
  const scores = grid.map(loss);
  if (scores.every(v => v === scores[0])) throw new RangeError('rate objective is flat');
  let best: Minimum = {mse: scores[0], rate: 0};
  const consider = (candidate: Minimum) => {
    if (candidate.mse < best.mse || (candidate.mse === best.mse && candidate.rate < best.rate)) best = candidate;
  };
  for (let i = 0; i < grid.length; i++) {
    consider({rate: grid[i], mse: scores[i]});
    if ((i > 0 && scores[i] > scores[i - 1]) || (i < 30 && scores[i] > scores[i + 1])) continue;
    consider(minimize(loss, grid[Math.max(0, i - 1)], grid[Math.min(30, i + 1)]));
  }
  if (!Number.isFinite(best.mse)) throw new RangeError('rate optimization failed');
  return {rate: best.rate, rmse: Math.sqrt(best.mse)};
}

const mean = (a: readonly number[]) => a.reduce((sum, v) => sum + v, 0) / a.length;

export function logDecay(timeS: readonly number[], room: readonly number[], background: number): number {
  steps(timeS);
  const obs = series(room, timeS.length, true, 'room CO2');
  if (!Number.isFinite(background) || background <= 0) throw new RangeError('invalid fixed background');
  const excess = obs.map(c => c - background);
  if (excess.some(x => x <= 0)) throw new RangeError('nonpositive excess');
  const x = timeS.map(t => (t - timeS[0]) / 3600);
  const y = excess.map(Math.log);
  const mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (y.every(v => v === y[0]) || !(sxy < 0)) throw new RangeError('no declining log trend');
  return -sxy / sxx;
}

function span(values: readonly number[]): number {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo;
}

function abstain(reason: string, flags = [reason]): InferenceResult {
  return {status: 'abstained', reason, flags, baseline_status: reason};
}

function numericalMessage(error: unknown): string {
  if (error instanceof RangeError) return error.message;
  throw error;
}

const atBound = (rate: number) => Math.min(rate, MAX_RATE - rate) < 1e-6;

/** An explicitly selected window. Mixed occupancy abstains for the whole selection. */
export function inferWindow({timeS, room, supply, occupancy}: WindowInput): InferenceResult {
  const n = timeS.length;
  if (!n || room.length !== n || occupancy.length !== n || (supply !== undefined && supply.length !== n)) {
    return abstain('invalid_measurements');
  }
  if (occupancy.some(c => !Number.isInteger(c) || c < 0 || c > 4)) return abstain('unknown_generation', ['unknown_occupancy', 'unknown_generation']);
  if (occupancy.some(c => c > 0)) return abstain('unknown_generation', ['occupied_occupancy', 'unknown_generation']);
  const t = timeS.map(s => s - timeS[0]);
  const b = supply ?? Array<number>(n).fill(BACKGROUND);
  if (!t.every((v,i) => Number.isFinite(v) && (!i || v > t[i-1])) ||
      !room.every(v => Number.isFinite(v) && v > 0) || !b.every(v => Number.isFinite(v) && v > 0)) {
    return abstain('invalid_measurements');
  }
  const duration = t[n - 1] / 60;
  const bErr = b.map(value => supply !== undefined ? 40 + .03 * value : 50);
  const result = abstain('under_minimum_duration', []);
  const flags = result.flags;
  result.room_span_ppm = span(room);
  result.room_drop_ppm = room[0] - room[n - 1];
  result.initial_excess_ppm = room[0] - b[0];
  if (duration < 20) flags.push('short_duration');
  if (result.room_span_ppm <= 2 * ROOM_ACCURACY) flags.push('low_variation');
  if (supply === undefined) flags.push('assumed_background');
  if (room.every((v,i) => Math.abs(v - b[i]) <= ROOM_ACCURACY + bErr[i])) flags.push('weak_room_supply_contrast');
  if (result.room_drop_ppm <= 0) flags.push('no_net_decay');
  if (duration < 10) return result;

  let weightedB = 0;
  for (let i = 1; i < n; i++) weightedB += (t[i] - t[i - 1]) * b[i - 1];
  try {
    result.baseline_ach = logDecay(t, room, weightedB / t[n - 1]);
    result.baseline_status = 'estimated';
  } catch (err) { result.baseline_status = numericalMessage(err); }
  let rate: number;
  try {
    const fit = fitRate(t, room, b);
    rate = fit.rate;
    result.rate_ach = rate;
    result.rmse_ppm = fit.rmse;
  } catch (err) {
    result.reason = numericalMessage(err);
    return result;
  }
  if (atBound(rate)) flags.push('nominal_rate_at_bound');
  if (rate * t[n - 1] / 3600 < .25) flags.push('short_relative_to_time_constant');
  if (result.rmse_ppm > ROOM_ACCURACY) flags.push('large_fit_residual');

  const scenarios: Record<string, number | null> = {nominal: rate};
  const refit = (key: string, c: number[], background: readonly number[]) => {
    try { scenarios[key] = fitRate(t, c, background).rate; }
    catch (err) { numericalMessage(err); scenarios[key] = null; }
  };
  for (const signC of [-1, 1]) {
    const labelC = signC === 1 ? '+1' : '-1';
    for (const signB of [-1, 1]) {
      refit('room' + labelC + '_supply' + (signB === 1 ? '+1' : '-1'),
        room.map(v => v + signC * ROOM_ACCURACY), b.map((v,i) => v + signB * bErr[i]));
    }
    refit('room_drift' + labelC, room.map((v,i) => v + signC * ROOM_ACCURACY * (2 * t[i] / t[n-1] - 1)), b);
  }
  result.scenario_rates = scenarios;
  const rates = Object.values(scenarios);
  if (rates.every((r): r is number => r !== null)) {
    result.sensitivity_low_ach = Math.min(...rates);
    result.sensitivity_high_ach = Math.max(...rates);
    result.sensitivity_width_ach = result.sensitivity_high_ach - result.sensitivity_low_ach;
    if (result.sensitivity_width_ach > Math.max(1, .5 * rate)) flags.push('parameter_sensitive');
    if (rates.some(atBound)) flags.push('scenario_at_bound');
  } else flags.push('incomplete_sensitivity');

  const mid = t.findIndex(v => v >= .5 * t[n-1]);
  const halves = [[0, mid + 1], [mid, n]];
  const canSplit = halves.every(([i, j]) => t[j - 1] - t[i] >= 600 && span(room.slice(i,j)) > 2 * ROOM_ACCURACY);
  result.rate_change_check = 'insufficient_half_window_signal_or_duration';
  if (canSplit) {
    try {
      const [k1, k2] = halves.map(([i,j]) => fitRate(t.slice(i,j), room.slice(i,j), b.slice(i,j)).rate);
      result.first_half_ach = k1;
      result.second_half_ach = k2;
      result.rate_change_check = 'assessed';
      if (Math.abs(k1 - k2) > Math.max(1, .5 * rate)) flags.push('possible_rate_change');
    } catch (err) { numericalMessage(err); result.rate_change_check = 'indeterminate'; }
  }
  result.reason = '';
  result.status = flags.length ? 'flagged' : 'passes_checks';
  return result;
}
