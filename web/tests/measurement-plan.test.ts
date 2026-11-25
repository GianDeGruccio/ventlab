import { expect, it } from 'vitest'
import { captureWindow, repeatDefaults, repeatInputs } from '../src/recording-plan'
import { recordingReport, simulationReport, type Decision } from '../src/report'
import { parseCustomRecording, revealReference } from '../src/recordings'
import { defaultPlanningConstraints, robustPlan } from '../src/robust'
import { compareMeasurement } from '../src/comparison-model'
import { defaultDesign, experiment } from '../src/design'

function fixture(flow: number) {
  const rows = Array.from({ length: 16 }, (_, i) =>
    [i * 60, 420 + 600 * Math.exp((-2 * i) / 60), 0, 420, flow].join(','),
  )
  return parseCustomRecording(
    's,c,n,b,q\n' + rows.join('\n'),
    'trace.csv',
    { time: 's', room: 'c', occupancy: 'n', supply: 'b', flow: 'q' },
    21.87,
  )
}
function selected(flow = 10) {
  const r = fixture(flow)
  return captureWindow(r, r.sessions[0], 2, 15)
}
function reportWithPlan(w: ReturnType<typeof selected>) {
  const inputs = repeatInputs({ ...repeatDefaults(w), noise: '17' })
  const plan = robustPlan(inputs)
  return recordingReport(w, {
    inputs,
    decision: {
      mode: 'robust',
      selected: plan.recommended.id,
      recommended: plan.recommended.id,
      alternatives: plan.options,
      constraints: defaultPlanningConstraints,
      ensembleSize: plan.ensembleSize,
    },
  })
}
it('carries exact bounds, timestamps and measurement units with no assumed noise', () => {
  const w = selected(),
    defaults = repeatDefaults(w)
  expect([w.startRow, w.endRow, w.duration, w.interval, w.input.timeS.at(-1)]).toEqual([
    3, 16, 13, 1, 780,
  ])
  expect(w.initial).toBeCloseTo(420 + 600 * Math.exp(-4 / 60))
  expect(defaults).toEqual({
    initial: String(w.initial),
    duration: '13',
    interval: '1',
    occupancy: '0',
    noise: '',
    supplyKnown: true,
  })
  expect(() => repeatInputs(defaults)).toThrow(/noise/)
})
it('isolates the entire report and decision from changed or revealed airflow', () => {
  const a = fixture(123),
    b = fixture(-9876)
  expect(revealReference(a, a.sessions[0], 2, 15).status).toBe('usable')
  expect(revealReference(b, b.sessions[0], 2, 15).status).toBe('negative_flow')
  const left = reportWithPlan(captureWindow(a, a.sessions[0], 2, 15))
  expect(left).toEqual(reportWithPlan(captureWindow(b, b.sessions[0], 2, 15)))
  expect(Object.keys(left.proposedRepeat!.assumptions).sort()).toEqual([
    'duration',
    'initial',
    'interval',
    'noise',
    'occupancy',
    'supplyKnown',
  ])
  expect(left.afterMeasurement).toBeNull()
  expect(left.estimator.results.rate_ach).toBeCloseTo(2, 6)
})
it('preserves partial supply and variable occupancy without promoting them to measured constants', () => {
  const r = fixture(10),
    s = r.sessions[0]
  s.rows[5].occupancy = 1
  s.rows[6].supply = NaN
  s.rows[7].timeS += 25
  const w = captureWindow(r, s, 0, 15)
  expect(w.irregular).toBe(true)
  expect(w.supplyCount).toBe(15)
  expect(w.interval).toBe(1)
  expect(repeatDefaults(w)).toMatchObject({ occupancy: '', supplyKnown: false })
  expect(recordingReport(w).estimator.results.reason).toBe('unknown_generation')
  expect(repeatInputs({ ...repeatDefaults(w), occupancy: '1', noise: '0' }).occupancy).toBe(1)
})
it('does not silently clip unsupported observations or infer a cadence from one row', () => {
  const r = fixture(10)
  r.sessions[0].rows[0].room = 10005
  const w = captureWindow(r, r.sessions[0], 0, 0)
  expect([w.duration, w.initial, w.interval]).toEqual([0, 10005, null])
  expect(repeatDefaults(w)).toMatchObject({ initial: '', duration: '', interval: '' })
  expect(recordingReport(w).estimator.results.status).toBe('abstained')
})
it('rejects invalid schedules, nonintegral counts and noise outside the supported range', () => {
  const f = { ...repeatDefaults(selected()), noise: '10' }
  for (const patch of [
    { occupancy: '1.5' },
    { noise: '101' },
    { duration: '4' },
    { interval: '14' },
    { initial: 'NaN' },
  ])
    expect(() => repeatInputs({ ...f, ...patch })).toThrow()
})
it('keeps proposed and executed synthetic strategies distinct and exports their actual fits', () => {
  const d = { ...defaultDesign },
    r = experiment(d)
  const decision: Decision = {
    mode: 'scenario',
    selected: 'precision',
    recommended: r.strategies[0].id,
    alternatives: r.strategies,
  }
  const pair = compareMeasurement(d, r, 'empty', d.duration, 'Observe an empty room')
  const a = simulationReport(d, r, decision, pair)
  expect(a.before.roomObservationsPpm).toEqual(r.observed)
  expect(a.before.compatibleRangeAch).toEqual([r.compatibleLow, r.compatibleHigh])
  expect(a.plannedSelection.selected).toBe('precision')
  expect(a.executedComparison!.strategy).toBe(pair.label)
  expect(a.executedComparison!.after.absoluteRateErrorAch).toBe(
    Math.abs(pair.after.rate - pair.second.fitRate),
  )
  expect(simulationReport(d, r, decision, null).executedComparison).toBeNull()
})
