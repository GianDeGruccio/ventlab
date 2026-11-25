/** Phase 3 assessment-only generator. Designers see the planned fields, never these physical truths. */
import { analyzeTrace as historicalFit, type Design } from './historical/design'
import protocol from './fixtures/phase3-stress-protocol.json'

export type StressCase = (typeof protocol.evaluation)[number]
export type Action = 'baseline' | 'empty' | 'longer' | 'precision' | 'supply'
export type Policy = 'unchanged' | 'nominal' | 'rule' | 'robust'
export const policies: Policy[] = ['unchanged', 'nominal', 'rule', 'robust']
export const actions: Action[] = ['baseline', 'empty', 'longer', 'precision', 'supply']

export function plannedDesign(c: StressCase): Design {
  const [initial, duration, interval, noise, occupancy] = c.d.slice(0,5).map(Number)
  return {...protocol.planningNominal, initial, duration, interval, noise, occupancy, supplyKnown: c.d[5] === true}
}

export function feasible(c: StressCase, action: Action): boolean {
  if (c.unavailable.includes(action)) return false
  const d = plannedDesign(c)
  switch (action) {
    case 'empty': return d.occupancy > 0
    case 'longer': return Math.min(480, c.cap) > d.duration
    case 'precision': return d.noise > 1
    case 'supply': return !d.supplyKnown
    case 'baseline': return true
  }
}

export function simpleRule(c: StressCase): Action {
  return (['empty','longer','precision','supply','baseline'] as const).find(id => feasible(c,id))!
}

function stream(seed: number, tag: number) {
  let state = (seed ^ tag) >>> 0
  function uniform() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state + .5) / 4294967296
  }
  // Discard the first 8 draws, spreading adjacent seed values before taking a bias sample.
  for (let i=0; i<8; i++) uniform()
  return uniform
}

function traceSettings(d: Design, action: Action, cap: number) {
  return {
    duration: action === 'longer' ? Math.min(480, cap, 2*d.duration) : d.duration,
    noise: action === 'precision' ? d.noise / 2 : d.noise,
    occupancy: action === 'empty' ? 0 : d.occupancy,
    supplyKnown: action === 'supply' || d.supplyKnown,
  }
}

export function stressTrace(c: StressCase, action: Action, seed: number, rng=stream, emptyRateFactor=1) {
  if (!feasible(c, action)) throw new RangeError('Infeasible planning action')
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid seed')
  const d = plannedDesign(c)
  const settings = traceSettings(d,action,c.cap)
  const noiseDraw = rng(seed, 0x13579bdf)
  const roomDraw = rng(seed, 0x2468ace0)
  const supplyDraw = rng(seed, 0x53417021)
  const jitterDraw = rng(seed, 0x9f27cafe)
  const gaussian = () => Math.sqrt(-2*Math.log(noiseDraw())) * Math.cos(2*Math.PI*noiseDraw())
  const roomBias = c.biases[0] + (2*roomDraw()-1)*c.biases[1]
  const ductBias = c.biases[2] + (2*supplyDraw()-1)*c.biases[3]
  const minutes = [0]
  for (let t=d.interval; t<settings.duration; t+=d.interval) {
    minutes.push(t + c.jitter * d.interval * (2 * jitterDraw() - 1))
  }
  minutes.push(settings.duration)

  let physical = d.initial-roomBias
  let rateMinutes = 0
  let sourceMinutes = 0
  let noiseState = gaussian()
  const observed = [physical+roomBias+noiseState*settings.noise]
  const half = d.duration/2
  for (let i=1; i<minutes.length; i++) {
    let t = minutes[i-1]
    const end = minutes[i]
    while (t < end) {
      // Alternating half-blocks repeat for longer observations. Crosses boundaries exactly.
      const segment = Math.floor(t/half)
      const stop = Math.min(end, (segment+1)*half)
      const level = segment % 2
      const k = c.k[level] * (action === 'empty' ? emptyRateFactor : 1), g = c.g[level]*settings.occupancy
      const h = (stop-t)/60
      const integral = k === 0 ? h : -Math.expm1(-k*h)/k
      physical += integral * (k*(c.b-physical)+g)
      sourceMinutes += g*(stop-t)
      rateMinutes += k*(stop-t)
      t = stop
    }
    const rho = c.rho ** ((end-minutes[i-1])/d.interval)
    noiseState = rho*noiseState + Math.sqrt(1-rho*rho)*gaussian()
    observed.push(physical+roomBias+settings.noise*noiseState)
  }
  return {
    minutes, observed, settings: {...settings, nominalSupply: settings.supplyKnown ? c.b+ductBias : 420},
    targetRate: rateMinutes/settings.duration, targetSource: sourceMinutes/settings.duration,
  }
}

export function assessTrial(c: StressCase, action: Action, seed: number, analyzeTrace=historicalFit, rng=stream, emptyRateFactor=1) {
  const t = stressTrace(c,action,seed,rng,emptyRateFactor)
  const fit = analyzeTrace(t.minutes,t.observed,t.settings)
  return {
    seed, minutes:t.settings.duration, rate:fit.rate, source:fit.generation, rmse:fit.rmse,
    targetRate:t.targetRate, targetSource:t.targetSource, width:fit.width, low:fit.low, high:fit.high,
    inside: "regions" in fit ? (fit.regions as [number,number][]).some(([lo,hi])=>lo<=t.targetRate && t.targetRate<=hi) : fit.low<=t.targetRate && t.targetRate<=fit.high,
    boundary:fit.rate===0 || fit.rate===8,
    rateError:Math.abs(fit.rate-t.targetRate), sourceError:Math.abs(fit.generation-t.targetSource),
  }
}
