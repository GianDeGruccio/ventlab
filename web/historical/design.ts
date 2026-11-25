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
const RATES = Array.from({ length: 161 }, (_, i) => i / 20)
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
function profile(minutes: number[], observed: number[], b: number, rates: number[]): Quadratic[] {
  return rates.map((k) => {
    let ee = 0,
      pp = 0,
      ep = 0,
      ez = 0,
      pz = 0,
      zz = 0
    for (let i = 0; i < minutes.length; i++) {
      const phi = basis(k, minutes[i])
      const e = Math.exp((-k * minutes[i]) / 60)
      const z = observed[i] - b
      ee += e * e
      pp += phi * phi
      ep += e * phi
      ez += e * z
      pz += phi * z
      zz += z * z
    }
    const curvature = pp - (ep * ep) / ee
    const hBest = (pz - (ep * ez) / ee) / curvature
    return {
      k,
      curvature,
      hBest,
      minLoss: Math.max(0, zz - (ez * ez) / ee - curvature * hBest * hBest),
      startTerm: ez / ee,
      startSlope: ep / ee,
    }
  })
}

function loss(p: Quadratic, h: number) {
  return p.minLoss + p.curvature * (h - p.hBest) ** 2
}

function compatible(profiles: Quadratic[], d: Pick<Design, 'occupancy' | 'noise' | 'supplyKnown'>) {
  const maxSource = MAX_SOURCE_PER_PERSON * d.occupancy
  const delta = 30 + (d.supplyKnown ? 10 : 75)
  const losses = profiles.map((p) => {
    // h = G + k*(room offset + true B - nominal B). Independent bounded nuisances.
    const h = clamp(p.hBest, -p.k * delta, maxSource + p.k * delta)
    return loss(p, h)
  })
  return compatibilitySpan(profiles.map(p => p.k), losses, d.noise)
}

/** Finite rate-grid envelope using the frozen Phase 2 relative-SSE threshold. */
export function compatibilitySpan(rates: number[], losses: number[], noise: number) {
  const threshold = Math.min(...losses) + 4 * Math.max(noise, 1) ** 2
  const inside = losses.map((value) => value <= threshold)
  const first = inside.indexOf(true),
    last = inside.lastIndexOf(true)
  const crossing = (i: number, j: number) =>
    rates[i] + ((rates[j] - rates[i]) * (threshold - losses[i])) / (losses[j] - losses[i])
  const low = first === 0 ? 0 : crossing(first - 1, first)
  const high = last === rates.length - 1 ? MAX_RATE : crossing(last, last + 1)
  return { low, high, width: high - low }
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
  const rates = RATES.includes(d.rate) ? RATES : [...RATES, d.rate].sort((a, b) => a - b)
  return compatible(profile(minutes, expected, background(d), rates), d).width
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
  const profiles = profile(minutes, observed, settings.nominalSupply, RATES)
  const fit = nominal(profiles, settings.occupancy)
  return {
    rate: fit.p.k,
    generation: fit.g,
    rmse: Math.sqrt(fit.sse / minutes.length),
    ...compatible(profiles, settings),
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
  const profiles = profile(trace.minutes, trace.observed, b, RATES)
  const fit = nominal(profiles, d.occupancy)
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
  const band = compatible(profiles, d)
  const sources = Array.from({ length: 33 }, (_, i) => (upper * i) / 32)
  return {
    ...trace,
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
