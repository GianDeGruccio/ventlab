import { it, expect } from 'vitest'
import reference from '../fixtures/phase6-reference.json'
import { recover, defaultDesign, experiment, observe } from '../src/design'
import { continuousBand } from '../src/profile-search'
import { robustPlan } from '../src/robust'
import { simulationReport } from '../src/report'
import { compareMeasurement } from '../src/comparison-model'
import { inferWindow } from '../src/physics'
import { csvHeaders, parseBundledRecording } from '../src/recordings'
import data from '../../data/raw/ventilation_test.csv?raw'
import { captureWindow, repeatDefaults, repeatInputs } from '../src/recording-plan'
import { repeatEligibility } from '../src/repeat-eligibility'
import { keyedStream, matchedPlans } from '../phase6-study'
import protocol from '../fixtures/phase3-stress-protocol.json'
import { assessTrial } from '../stress-simulation'
import { analyzeTrace } from '../src/design'

it.each(reference)('continuous fit and crossings against SciPy at $rate h⁻¹', (c) => {
  const d = {
    ...defaultDesign,
    ...c,
    noise: 0,
    occupancy: 0,
    generation: 0,
    supply: 430,
    supplyKnown: true,
  }
  const trace = observe(d)
  const fit = analyzeTrace(trace.minutes, trace.observed, {
    occupancy: 0,
    supplyKnown: true,
    nominalSupply: 430,
    noise: c.noise,
  })
  expect(fit.rate).toBeCloseTo(c.fit, 6)
  expect(fit.low).toBeCloseTo(c.low, 7)
  expect(fit.high).toBeCloseTo(c.high, 7)
})
it('finds disjoint compatible regions and a flat full domain', () => {
  const r = continuousBand((x) => 1e6 * ((x - 0.713) * (x - 5.321)) ** 2, 0)
  expect(r.regions.length).toBe(2)
  expect(r.regions[0][1]).toBeLessThan(1)
  expect(r.regions[1][0]).toBeGreaterThan(5)
  expect(continuousBand(() => 10, 0).regions).toEqual([[0, 8]])
})
it('suppresses arbitrary equilibrium point errors for both indistinguishable truths', () => {
  for (const [rate, generation] of [
    [0.3, 30],
    [2, 200],
  ]) {
    const d = {
      ...defaultDesign,
      rate,
      generation,
      initial: 520,
      supply: 420,
      noise: 0,
      supplyKnown: true,
    }
    const r = experiment(d)
    expect(observe(d).observed.every((v) => v === 520)).toBe(true)
    const pair = compareMeasurement(d, r, 'empty', 60, 'Teaching example · Observe an empty room', 'teaching')
    const report = simulationReport(
      d,
      r,
      { mode: 'scenario', selected: 'empty', recommended: 'empty', alternatives: r.strategies },
      pair,
    )
    expect(report.executedComparison!.context).toContain('teaching')
    expect(report.before.fitRateAch).toBeNull()
    expect(report.before.absoluteRateErrorAch).toBeNull()
    expect(report.executedComparison!.absoluteErrorChangeAch).toBeNull()
    expect(pair.second.compatibleWidth).toBeLessThan(r.compatibleWidth)
  }
})
it('labels the audited occupied period and proposed empty intervention with different eligibility', () => {
  const rec = parseBundledRecording('ventilation_test.csv', data),
    s = rec.sessions.find((s) => s.id === 2)!,
    p = s.periods[1]
  const w = captureWindow(rec, s, p.start, p.end)
  expect(w.startStamp).toContain('2025-11-25 06:37')
  const input = repeatInputs({ ...repeatDefaults(w), noise: '18' })
  expect(w.result.reason).toBe('unknown_generation')
  const plan = robustPlan(input)
  expect(plan.recommended.id).toBe('precision')
  expect(
    repeatEligibility(input, plan.recommended.id, plan.recommended.minutes).eligibleByDesign,
  ).toBe(false)
  expect(repeatEligibility(input, 'empty', input.duration).operatingCondition).toContain(
    'different target',
  )
})
it('flags two-sample residuals and explicitly records unavailable half-window information', () => {
  const r = inferWindow({
    timeS: [0, 3600],
    room: [1500, 700],
    supply: [420, 420],
    occupancy: [0, 0],
  })
  expect(r.flags).toContain('insufficient_residual_information')
  expect(r.rate_change_check).toBe('insufficient_half_window_signal_or_duration')
})
it('rejects a dangling quote and accepts escaped quotes and embedded newlines', () => {
  expect(() => csvHeaders('a,b\n1,"2')).toThrow(/Unterminated/)
  expect(csvHeaders('a,b\n1,"a""b\nc"')).toEqual(['a', 'b'])
})
it('uses matched actions and costs and paired domain-separated draws', () => {
  const c = protocol.development[0],
    plan = matchedPlans(c)
  expect(plan.nominal.map((x) => x.id).sort()).toEqual(plan.robust.options.map((x) => x.id).sort())
  expect(plan.nominal.find((x) => x.id === 'baseline')!.score).toBe(0)
  expect(keyedStream(100, 1)()).not.toBe(keyedStream(100, 2)())
  expect(keyedStream(100, 1)()).toBe(keyedStream(100, 1)())
  const base = assessTrial(c, 'baseline', 80, analyzeTrace, keyedStream, 0.5)
  const empty = assessTrial(c, 'empty', 80, analyzeTrace, keyedStream, 0.5)
  expect(empty.targetRate).toBeCloseTo(base.targetRate / 2)
})
