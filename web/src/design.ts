import {continuousMinimum, continuousBand, searchRates as RATES} from './profile-search'
/** Prospective, single-zone experiments. Time in minutes at the UI boundary. */
export interface Design {
  rate: number
  initial: number
  supply: number
  duration: number
  interval: number
  noise: number
  offset: number
  occupancy: number
  generation: number
  supplyKnown: boolean
  seed: number
}

export const defaultDesign: Design = {
  rate: 1.8,
  initial: 1300,
  supply: 430,
  duration: 60,
  interval: 2,
  noise: 18,
  offset: 0,
  occupancy: 1,
  generation: 450,
  supplyKnown: false,
  seed: 42,
}

const MAX_RATE = 8
const MAX_SOURCE_PER_PERSON = 1200

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

function check(d: Design) {
  const limits: [number, number, number][] = [
    [d.rate, 0, MAX_RATE],
    [d.initial, 1, 10_000],
    [d.supply, 1, 10_000],
    [d.duration, 5, 480],
    [d.interval, 0.25, Math.min(d.duration, 15)],
    [d.noise, 0, 100],
    [d.offset, -100, 100],
    [d.occupancy, 0, 4],
    [d.generation, 0, MAX_SOURCE_PER_PERSON],
    [d.seed, 0, 0xffffffff],
  ]
  if (
    limits.some(([v, lo, hi]) => !Number.isFinite(v) || v < lo || v > hi) ||
    !Number.isInteger(d.occupancy) ||
    !Number.isInteger(d.seed) ||
    typeof d.supplyKnown !== 'boolean'
  ) {
    throw new RangeError('Experimental inputs must be finite and within their supported ranges.')
  }
}

function gaussian(seed: number) {
  let s = seed >>> 0
  function uniform() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return (s + 0.5) / 4294967296
  }
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform())
}

function basis(k: number, minutes: number) {
  const h = minutes / 60
  return k === 0 ? h : -Math.expm1(-k * h) / k
}

/** Closed-form solution with constant supply and source. Always includes the end time. */
export function observe(d: Design) {
  check(d)
  const minutes = Array.from(
    { length: Math.ceil(d.duration / d.interval) },
    (_, i) => i * d.interval,
  )
  minutes.push(d.duration)
  const source = d.generation * d.occupancy
  const truth = minutes.map(
    (t) => d.initial + basis(d.rate, t) * (d.rate * (d.supply - d.initial) + source),
  )
  const draw = gaussian(d.seed)
  const observed = truth.map((c) => c + d.offset + d.noise * draw())
  return { minutes, truth, observed }
}

interface Quadratic {
  k: number
  // SSE after fitting the start level is a quadratic function of effective source h.
  curvature: number
  hBest: number
  minLoss: number
  startTerm: number
  startSlope: number
}

/** Eliminate the unknown observed start analytically from z = e*A + phi*h, z = y - B. */
function profileAt(minutes: number[], observed:number[], b:number) {
  const cache=new Map<number,Quadratic>()
  const hours=minutes.map(t=>t/60)
  const z=observed.map(v=>v-b)
  return (k:number):Quadratic => {
    const cached=cache.get(k)
    if(cached) return cached
    const e=hours.map(t=>Math.exp(-k*t))
    const phi=hours.map(t=>k===0?t:-Math.expm1(-k*t)/k)
    let ee=0, ep=0, ez=0
    for(let i=0;i<z.length;i++){ee+=e[i]*e[i]; ep+=e[i]*phi[i]; ez+=e[i]*z[i]}
    const startTerm=ez/ee, startSlope=ep/ee
    let curvature=0, cross=0
    for(let i=0;i<z.length;i++){
      const orth=phi[i]-startSlope*e[i]
      curvature+=orth*orth
      cross+=orth*(z[i]-startTerm*e[i])
    }
    const hBest=cross/curvature
    let minLoss=0
    for(let i=0;i<z.length;i++){
      const residual=(z[i]-e[i]*startTerm)-(phi[i]-e[i]*startSlope)*hBest
      minLoss+=residual*residual
    }
    const point={k,curvature,hBest,minLoss,startTerm,startSlope}
    cache.set(k,point)
    return point
  }
}

function loss(p: Quadratic, h: number) {
  return p.minLoss + p.curvature * (h - p.hBest) ** 2
}

function compatible(at:ReturnType<typeof profileAt>, d:Pick<Design,'occupancy'|'noise'|'supplyKnown'>) {
  const delta=30+(d.supplyKnown?10:75)
  return continuousBand(k=>{
    const p=at(k)
    return loss(p,clamp(p.hBest,-k*delta,MAX_SOURCE_PER_PERSON*d.occupancy+k*delta))
  },d.noise)
}

function fitted(at:ReturnType<typeof profileAt>, occupancy:number) {
  const best=continuousMinimum(k=>{const p=at(k);return loss(p,clamp(p.hBest,0,MAX_SOURCE_PER_PERSON*occupancy))})
  return nominal([at(best.k)],occupancy)
}

// A constant nominal trajectory can be sustained by G=k(C-B). Require multiple admissible rates.
function nonUnique(minutes:number[], y:number[], b:number, occupancy:number) {
  const excess=y[0]-b
  const constant=y.every(v=>Math.abs(v-y[0]) <= 1e-10)
  return minutes.length===2 && occupancy>0 || constant && (Math.abs(excess)<=1e-10 || occupancy>0 && excess>0)
}

function background(d: Design) {
  return d.supplyKnown ? d.supply : 420
}

/** Research-only constant-source fit. Contains neither the reference ACH nor the generation setting. */
function nominal(profiles: Quadratic[], occupancy: number) {
  const candidates = profiles.map((p) => {
    const g = clamp(p.hBest, 0, MAX_SOURCE_PER_PERSON * occupancy)
    return { p, g, sse: loss(p, g) }
  })
  return candidates.reduce((best, x) => (x.sse < best.sse ? x : best))
}

/** Width of the expected-trace separation band, conditional on this proposed design. */
export function plannedWidth(d: Design) {
  const { minutes, truth } = observe(d)
  const expected = truth.map((c) => c + d.offset)
  return compatible(profileAt(minutes,expected,background(d)),d).width
}

export interface Strategy {
  id: string
  label: string
  width: number
  reduction: number
  minutes: number
}

export function interventions(d: Design): { id: string; label: string; design: Design }[] {
  const options = []
  if (d.duration < 480)
    options.push({
      id: 'longer',
      label: 'Extend the observation',
      design: { ...d, duration: Math.min(480, 2 * d.duration) },
    })
  if (d.noise > 1)
    options.push({
      id: 'precision',
      label: 'Halve sensor noise',
      design: { ...d, noise: d.noise / 2 },
    })
  if (!d.supplyKnown)
    options.push({ id: 'supply', label: 'Measure supply CO₂', design: { ...d, supplyKnown: true } })
  if (d.occupancy > 0)
    options.push({ id: 'empty', label: 'Observe an empty room', design: { ...d, occupancy: 0 } })
  return options
}

export function recommend(d: Design) {
  const width = plannedWidth(d)
  const strategies: Strategy[] = interventions(d).map(({ id, label, design }) => {
    const newWidth = plannedWidth(design)
    return { id, label, width: newWidth, reduction: width - newWidth, minutes: design.duration }
  })
  strategies.sort(
    (a, b) => b.reduction - a.reduction || a.minutes - b.minutes || a.id.localeCompare(b.id),
  )
  return { width, strategies }
}

/** Fit supplied observations without access to the simulated ventilation or generation. */
export function analyzeTrace(
  minutes: number[],
  observed: number[],
  settings: Pick<Design, 'occupancy' | 'noise' | 'supplyKnown'> & { nominalSupply: number },
) {
  if (
    minutes.length < 2 ||
    minutes.length !== observed.length ||
    minutes[0] !== 0 ||
    minutes.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= minutes[i - 1])) ||
    observed.some((c) => !Number.isFinite(c)) ||
    !Number.isFinite(settings.nominalSupply) ||
    settings.nominalSupply <= 0 ||
    !Number.isInteger(settings.occupancy) ||
    settings.occupancy < 0 ||
    settings.occupancy > 4 ||
    !Number.isFinite(settings.noise) ||
    settings.noise < 0 ||
    typeof settings.supplyKnown !== 'boolean'
  ) throw new RangeError('Invalid synthetic recovery observations or sensor settings.')
  const at=profileAt(minutes,observed,settings.nominalSupply)
  const fit=fitted(at,settings.occupancy)
  return {
    rate: fit.p.k,
    generation: fit.g,
    rmse: Math.sqrt(fit.sse / minutes.length),
    nonUnique:nonUnique(minutes,observed,settings.nominalSupply,settings.occupancy),
    ...compatible(at, settings),
  }
}

/** Used by the original Phase 2 seeded benchmark. */
export function recover(d: Design) {
  const { minutes, observed } = observe(d)
  return analyzeTrace(minutes, observed, { ...d, nominalSupply: background(d) })
}

export function experiment(d: Design, maxDisplayGeneration?: number) {
  const trace = observe(d)
  const b = background(d)
  const at=profileAt(trace.minutes,trace.observed,b)
  const profiles=RATES.map(at)
  const fit=fitted(at,d.occupancy)
  // Compare a substantially different, still physically allowed rate. The truth is used
  // only for this deliberate teaching contrast and the prospective design calculation.
  const alt = nominal(
    profiles.filter((p) => Math.abs(p.k - d.rate) >= 0.75),
    d.occupancy,
  )
  const start = alt.p.startTerm - alt.g * alt.p.startSlope
  const alternative = trace.minutes.map(
    (t) => b + Math.exp((-alt.p.k * t) / 60) * start + basis(alt.p.k, t) * alt.g,
  )
  const displayed = profiles.filter((_, i) => i % 4 === 0)
  const upper = maxDisplayGeneration ?? MAX_SOURCE_PER_PERSON * Math.max(d.occupancy, 1)
  if (!Number.isFinite(upper) || upper <= 0 || upper > 4 * MAX_SOURCE_PER_PERSON)
    throw new RangeError('Display generation limit must lie in (0, 4800] ppm/h.')
  const band = compatible(at, d)
  const sources = Array.from({ length: 33 }, (_, i) => (upper * i) / 32)
  return {
    ...trace,
    nonUnique:nonUnique(trace.minutes,trace.observed,b,d.occupancy), compatibleRegions:band.regions,
    compatibleLow: band.low, compatibleHigh: band.high, compatibleWidth: band.width,
    alternative,
    alternativeRate: alt.p.k,
    alternativeGeneration: alt.g,
    alternativeRmse: Math.sqrt(alt.sse / trace.minutes.length),
    rates: displayed.map((p) => p.k),
    sources,
    surface: sources.map((g) => displayed.map((p) => Math.sqrt(loss(p, g) / trace.minutes.length))),
    fitRate: fit.p.k,
    fitGeneration: fit.g,
    rmse: Math.sqrt(fit.sse / trace.minutes.length),
    ...recommend(d),
  }
}
