import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {fitRate, inferWindow, logDecay, simulate} from '../src/physics';
import type {InferenceResult} from '../src/physics';
import fixtures from '../fixtures/python-physics.json';

function absolute(actual: number | undefined, expected: number, tolerance: number) {
  expect(actual).toBeDefined();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
}

/** Solver roundoff and stopping criteria can differ between SciPy and the browser. */
function matchesInference(actual: InferenceResult, expected: Partial<InferenceResult>) {
  for (const key of ['reason', 'status', 'flags', 'baseline_status', 'rate_change_check'] as const) {
    expect(actual[key]).toEqual(expected[key]);
  }
  for (const key of ['rate_ach', 'first_half_ach', 'second_half_ach', 'sensitivity_low_ach',
    'sensitivity_high_ach', 'sensitivity_width_ach', 'rmse_ppm', 'baseline_ach',
    'initial_excess_ppm', 'room_drop_ppm', 'room_span_ppm'] as const) {
    const value = expected[key];
    if (value === undefined) expect(actual[key]).toBeUndefined();
    else absolute(actual[key], value, key === 'rmse_ppm' ? 1e-6 : 1e-5);
  }
  expect(Object.keys(actual.scenario_rates ?? {})).toEqual(Object.keys(expected.scenario_rates ?? {}));
  for (const [name, ref] of Object.entries(expected.scenario_rates ?? {})) {
    if (ref === null) expect(actual.scenario_rates?.[name]).toBeNull();
    else absolute(actual.scenario_rates?.[name] ?? undefined, ref, 1e-5);
  }
}

describe('Python reference trajectories', () => {
  for (const c of fixtures.trajectories) {
    it(c.name, () => {
      const pred = simulate(c.timeS, c.initial, c.supply, c.rate, c.generation);
      pred.forEach((x,i) => absolute(x,c.expectedPpm[i],1e-9));
      if (c.expectedRate !== undefined && c.expectedRmse !== undefined) {
        const fit = fitRate(c.timeS,c.expectedPpm,c.supply,c.generation);
        absolute(fit.rate,c.expectedRate,1e-6);
        absolute(fit.rmse,c.expectedRmse,1e-6);
      }
      if (c.expectedLogRate !== undefined && typeof c.supply === 'number') {
        absolute(logDecay(c.timeS,c.expectedPpm,c.supply),c.expectedLogRate,1e-10);
      }
    });
  }
});

describe('Python diagnostic fixtures', () => {
  for (const c of fixtures.windows) {
    it(c.name, () => matchesInference(inferWindow(c.window), c.expected as InferenceResult));
  }
});

interface ArchivedWindow extends InferenceResult {
  first_row: number;
  last_row: number;
}

describe('all Phase 1 empirical windows', () => {
  const path = new URL('../../reports/predictions.json', import.meta.url);
  const reports: Record<string, ArchivedWindow[]> = JSON.parse(readFileSync(path, 'utf8'));
  for (const [file, expected] of Object.entries(reports)) {
    it(file, () => {
      // The unchanged numeric source tables use unquoted ISO timestamps and numeric cells.
      const [header,...lines] = readFileSync(new URL('../../data/raw/'+file, import.meta.url),'utf8')
        .trimEnd().split(/\r?\n/);
      const cols = header.split(',');
      const raw = lines.map(row => row.split(','));
      const largest = {rate: 0, baseline: 0, rmse: 0, sensitivityWidth: 0, scenarioRate: 0};
      let fitted = 0;
      for (const r of expected) {
        const window = raw.slice(r.first_row,r.last_row + 1);
        const col = (name: string) => window.map(row => Number(row[cols.indexOf(name)]));
        const timeS = window.map(row => Date.parse(row[cols.indexOf('time')].replace(' ','T')+'Z') / 1000);
        const supply = cols.includes('Supply air CO2 (ppm)') ? col('Supply air CO2 (ppm)') : undefined;
        const result = inferWindow({timeS, supply, room: col('Room CO2 (ppm)'), occupancy: col('Occupant count')});
        matchesInference(result,r);
        if (result.rate_ach !== undefined) {
          fitted++;
          largest.rate = Math.max(largest.rate, Math.abs(result.rate_ach - r.rate_ach!));
          largest.rmse = Math.max(largest.rmse, Math.abs(result.rmse_ppm! - r.rmse_ppm!));
          if (result.sensitivity_width_ach !== undefined) {
            largest.sensitivityWidth = Math.max(largest.sensitivityWidth,
              Math.abs(result.sensitivity_width_ach - r.sensitivity_width_ach!));
          }
          for (const [key, value] of Object.entries(result.scenario_rates!)) {
            if (value !== null) largest.scenarioRate = Math.max(largest.scenarioRate,
              Math.abs(value - r.scenario_rates![key]!));
          }
        }
        if (result.baseline_ach !== undefined) {
          largest.baseline = Math.max(largest.baseline, Math.abs(result.baseline_ach - r.baseline_ach!));
        }
      }
      if (process.env.VENTLAB_PARITY_SUMMARY) console.info(file, {periods: expected.length, fitted, largest});
    });
  }
});

describe('scientific input boundaries', () => {
  const fixture = fixtures.windows[0].window;
  it('ignores all reference airflow values', () => {
    const clean = inferWindow(fixture);
    const changed = {...fixture, flowLps: fixture.timeS.map(() => -1000)};
    expect(inferWindow(changed)).toEqual(clean);
  });
  it('abstains on mixed, unknown and occupied windows', () => {
    for (const c of [1,NaN,1.5,-1,5]) {
      const occ = [...fixture.occupancy];
      occ[2] = c;
      const result = inferWindow({...fixture, occupancy: occ});
      expect(result.status).toBe('abstained');
      expect(result.reason).toBe('unknown_generation');
      expect(result.baseline_ach).toBeUndefined();
    }
  });
  it('abstains on invalid room, supply, time or shape', () => {
    const broken = [NaN,...fixture.room.slice(1)];
    for (const input of [{...fixture,room:broken}, {...fixture,supply: broken}, {...fixture,room: []},
      {...fixture,timeS:fixture.timeS.map(() => 0)}]) {
      expect(inferWindow(input).reason).toBe('invalid_measurements');
    }
  });
  it('validates physical fields and strictly increasing time', () => {
    expect(() => simulate([0,1,1],500,400,1)).toThrow('increase');
    expect(() => simulate([0,1],500,400,-1)).toThrow('rate');
    expect(() => simulate([0,1],500,[400,NaN],1)).toThrow('supply');
    expect(() => simulate([0,1],500,400,1,-1)).toThrow('generation');
    expect(() => fitRate([0,1],[420,420],420)).toThrow('flat');
    expect(() => logDecay([0,1],[500,400],410)).toThrow('nonpositive excess');
    expect(() => logDecay([0,1],[500,510],410)).toThrow('no declining');
  });
  it('retains the zero and upper search boundaries', () => {
    const t = [0,60,120,180];
    expect(fitRate(t,[600,600,600,600],410).rate).toBe(0);
    expect(fitRate(t,simulate(t,1400,410,60),410).rate).toBe(30);
  });
});
