import { describe, it, expect } from 'vitest'
import { defaultDesign, experiment } from '../src/design'
import { chartSamples, compareMeasurement, compareErrors } from '../src/comparison-model'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
describe('Paired experiment protocol', () => {
  const design = { ...defaultDesign, occupancy: 3, interval: 7 }
  const first = experiment(design)
  it('extends to a capped duration and preserves unmatched timestamps without inventing observations', () => {
    const pair = compareMeasurement(design, first, 'longer', 75, 'Extend')
    const series = chartSamples(pair.first, pair.second)
    expect(series.minutes.at(-1)).toBe(75)
    const lastBefore = series.minutes.indexOf(60)
    expect(series.before[lastBefore]).toBe(first.observed.at(-1))
    expect(series.after[lastBefore]).toBeNaN()
    expect(series.before.at(-1)).toBeNaN()
    expect(pair.after.seed).toBe(design.seed)
  })
  it('uses the same source grid after emptying, preserves baseline settings and repeats exactly', () => {
    const pair = compareMeasurement(design, first, 'empty', design.duration, 'Empty')
    expect(pair.after.occupancy).toBe(0)
    expect(pair.before.occupancy).toBe(3)
    expect(pair.first.sources).toEqual(pair.second.sources)
    expect(pair.second).toEqual(
      compareMeasurement(design, first, 'empty', design.duration, 'Empty').second,
    )
  })
  it('keeping the current design reproduces the same recovery error and span', () => {
    const pair = compareMeasurement(design, first, 'baseline', design.duration, 'Keep')
    const e = compareErrors(pair)
    expect(pair.second).toEqual(pair.first)
    expect(e.before).toBe(e.after)
    expect(e.narrower || e.improved).toBe(false)
    expect(() => compareMeasurement(design, first, 'longer', 30, 'Invalid')).toThrow()
  })
  it('retains the archived Phase 2 benchmark bytes', () => {
    const bytes = readFileSync(new URL('../../reports/phase2-synthetic.json', import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '0861b105b1e63527404a0295d2bd03eb5351a0dc285f6999f8fbe802407ad159',
    )
  })
})
