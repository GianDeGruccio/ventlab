import {describe, expect, it} from 'vitest'
import {defaultDesign as defaults, observe, recover, experiment, recommend} from '../src/design'

describe('prospective synthetic experiments', () => {
  it('repeats identical observations with a seed and changes noise with another seed', () => {
    expect(observe(defaults)).toEqual(observe(defaults))
    const another = observe({...defaults, seed: 404})
    expect(another.truth).toEqual(observe(defaults).truth)
    expect(another.observed).not.toEqual(observe(defaults).observed)
  })
  it('propagates known constant source and samples a nondivisible end time', () => {
    const base = {...defaults, noise: 0, duration: 23, interval: 5, occupancy: 2, generation: 100, offset: -10}
    const r = observe({...base, rate: 0})
    expect(r.minutes).toEqual([0, 5, 10, 15, 20, 23])
    expect(r.truth.at(-1)).toBeCloseTo(base.initial + 200*23/60)
    expect(r.observed[0]).toBe(base.initial - 10)
    const empty = observe({...base, rate: 2, occupancy: 0})
    expect(empty.truth.at(-1)).toBeCloseTo(base.supply + (base.initial-base.supply)*Math.exp(-2*23/60))
  })
  it('rejects invalid, nonfinite and unbounded settings', () => {
    for (const patch of [{interval: 0}, {interval: 10, duration: 5}, {seed: -1}, {initial: NaN},
      {noise: -1}, {occupancy: 1.5}, {generation: 1201}, {rate: 9}, {duration: Infinity}]) {
      expect(() => observe({...defaults, ...patch})).toThrow(RangeError)
    }
  })
  it('recovers the on-grid joint rate and source from a noiseless excited transient', () => {
    const d = {...defaults, rate: 2.25, supplyKnown: true, noise: 0}
    const fit = recover(d)
    expect(fit.rate).toBe(d.rate)
    expect(fit.generation).toBeCloseTo(d.generation, 6)
    expect(fit.low).toBeLessThan(d.rate)
    expect(fit.high).toBeGreaterThan(d.rate)
    expect(fit.rmse).toBeLessThan(.001)
  })
  it('shows competing rates at exact occupied equilibrium and full-span ambiguity', () => {
    const r = experiment({...defaults, supply: 420, supplyKnown: true, initial: 520, rate: 2, generation: 200, noise: 0})
    expect(r.width).toBeCloseTo(8)
    expect(r.alternativeRmse).toBeLessThan(.001)
    expect(Math.abs(r.alternativeRate - 2)).toBeGreaterThanOrEqual(.75)
    expect(r.alternative.every(v => Math.abs(v - 520) < 1e-5)).toBe(true)
    expect(r.surface.length).toBe(r.sources.length)
    expect(r.surface.every(row => row.length === r.rates.length && row.every(Number.isFinite))).toBe(true)
  })
  it('ranks computed changes and omits interventions already applied', () => {
    const options = recommend({...defaults, supplyKnown: true, occupancy: 0})
    expect(options.strategies.map(s => s.id).sort()).toEqual(['longer', 'precision'])
    expect(options.strategies[0].width).toBeLessThanOrEqual(options.strategies[1].width)
    for (const s of options.strategies) expect(s.reduction).toBeCloseTo(options.width-s.width)
    expect(recommend({...defaults, seed: 999})).toEqual(recommend(defaults))
  })
})
