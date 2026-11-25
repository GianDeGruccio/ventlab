import { describe, expect, it } from 'vitest'
import { analyzeTrace, defaultDesign, observe, recover, experiment } from '../src/design'
import { defaultPlanningConstraints, planningInputs, robustPlan } from '../src/robust'

const p = planningInputs(defaultDesign)
const off = { allowEmpty: false, allowPrecision: false, allowSupply: false, maxMinutes: p.duration }

describe('finite-ensemble measurement planning', () => {
  it('cannot access the hidden rate, source, calibration, supply or seed', () => {
    const hidden = {
      ...defaultDesign,
      rate: 7.99,
      generation: 0,
      offset: 100,
      supply: 555,
      seed: 999,
    }
    expect(planningInputs(hidden)).toEqual(p)
    for (const key of ['rate', 'generation', 'offset', 'supply', 'seed']) {
      Object.defineProperty(hidden, key, {
        enumerable: true,
        get() {
          throw new Error('Hidden input read')
        },
      })
    }
    expect(robustPlan(hidden)).toEqual(robustPlan(p))
  })

  it('honors equipment, access and duration constraints and permits no change', () => {
    const keep = robustPlan(p, off)
    expect(keep.options.map((s) => s.id)).toEqual(['baseline'])
    expect(keep.recommended.score).toBe(0)
    const capped = robustPlan(p, { ...off, maxMinutes: p.duration + 10, extraHourPenalty: 100 })
    expect(capped.options.map((s) => s.id)).toEqual(['baseline', 'longer'])
    expect(capped.options[1].minutes).toBe(p.duration + 10)
    expect(capped.options[1].timePenalty).toBeCloseTo(100 / 6)
    expect(robustPlan({ ...p, occupancy: 0, supplyKnown: true, noise: 0 }, off).ensembleSize).toBe(
      72,
    )
  })

  it('calculates paired worst and average gains, computes the documented score and preserves ties', () => {
    const plan = robustPlan(p)
    expect(plan.ensembleSize).toBe(216)
    for (const r of plan.options) {
      expect(r.meanReduction).toBeCloseTo(plan.baseline.meanWidth - r.meanWidth, 9)
      expect(r.worstReduction).toBeLessThanOrEqual(r.meanReduction + 1e-9)
      expect(r.meanWidth).toBeLessThanOrEqual(r.worstWidth + 1e-9)
      expect(r.worstWidth).toBeLessThanOrEqual(8)
      expect(r.score).toBeCloseTo(0.5 * (r.meanReduction + r.worstReduction) - r.timePenalty, 10)
    }
    const weak = robustPlan(
      { ...p, duration: 5, interval: 5, noise: 100, initial: 420, occupancy: 0 },
      { ...off, maxMinutes: 5, allowPrecision: true },
    )
    expect(weak.options.every((o) => Math.abs(o.score) < 1e-9)).toBe(true)
    expect(weak.recommended.id).toBe('baseline')
    expect(robustPlan(p, defaultPlanningConstraints)).toEqual(plan)
  })

  it('matches direct measurement-by-measurement fits across all 216 planning worlds', () => {
    const short = { ...p, duration: 13, interval: 3 }
    const plan = robustPlan(short, { ...off, maxMinutes: 13, allowSupply: true })
    const baseline: number[] = [],
      measured: number[] = []
    for (const rate of [0.35, 1.25, 2.7, 5.5])
      for (const generation of [0, 450, 900])
        for (const supply of [370, 430, 490])
          for (const offset of [-30, 0, 30])
            for (const ductOffset of [-8, 8]) {
              const d = {
                ...defaultDesign,
                ...short,
                rate,
                generation,
                supply,
                offset,
                initial: p.initial - offset,
                noise: 0,
              }
              const { minutes, observed } = observe(d)
              for (const known of [false, true]) {
                const fit = analyzeTrace(minutes, observed, {
                  occupancy: p.occupancy,
                  noise: p.noise,
                  supplyKnown: known,
                  nominalSupply: known ? supply + ductOffset : 420,
                })
                ;(known ? measured : baseline).push(fit.width)
              }
            }
    const supplyOption = plan.options.find((o) => o.id === 'supply')!
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
    expect(plan.baseline.meanWidth).toBeCloseTo(mean(baseline), 7)
    expect(supplyOption.meanWidth).toBeCloseTo(mean(measured), 7)
    expect(supplyOption.worstWidth).toBeCloseTo(Math.max(...measured), 7)
    expect(supplyOption.worstReduction).toBeCloseTo(
      Math.min(...baseline.map((w, i) => w - measured[i])),
      7,
    )
  })

  it('rejects impossible inputs and constraints', () => {
    for (const changed of [
      { noise: -1 },
      { duration: Infinity },
      { occupancy: 0.5 },
      { interval: 0 },
      { initial: 30 },
    ])
      expect(() => robustPlan({ ...p, ...changed })).toThrow(RangeError)
    for (const changed of [
      { maxMinutes: p.duration - 1 },
      { extraHourPenalty: NaN },
      { extraHourPenalty: -1 },
    ])
      expect(() => robustPlan(p, changed)).toThrow(RangeError)
  })

  it('synchronized display axes leave fitted rates, compatible width and trajectories unchanged', () => {
    const d = { ...defaultDesign, occupancy: 0 }
    const regular = experiment(d),
      wide = experiment(d, 4800),
      recovery = recover(d)
    expect(wide.sources.at(-1)).toBe(4800)
    expect(wide.fitRate).toBe(regular.fitRate)
    expect(wide.truth).toEqual(regular.truth)
    expect(wide.observed).toEqual(regular.observed)
    expect(wide.compatibleLow).toBe(recovery.low)
    expect(wide.compatibleHigh).toBe(recovery.high)
    expect(wide.compatibleWidth).toBe(recovery.width)
    expect(() => experiment(d, 0)).toThrow(RangeError)
  })
})
