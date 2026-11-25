/** Equal-weight planning worlds, independent of the hidden trajectory in the Designer. */
import { compatibilitySpan, type Design } from './design'

export type PlanningInput = Pick<Design, 'initial' | 'duration' | 'interval' | 'noise' | 'occupancy' | 'supplyKnown'>

export function planningInputs(d: Design): PlanningInput {
  const { initial, duration, interval, noise, occupancy, supplyKnown } = d
  return { initial, duration, interval, noise, occupancy, supplyKnown }
}

export interface PlanningConstraints {
  maxMinutes: number
  extraHourPenalty: number
  allowEmpty: boolean
  allowSupply: boolean
  allowPrecision: boolean
}

export const defaultPlanningConstraints: Readonly<PlanningConstraints> = Object.freeze({
  maxMinutes: 480, extraHourPenalty: 0.25, allowEmpty: true, allowSupply: true, allowPrecision: true,
})

export type OptionId = 'baseline' | 'longer' | 'precision' | 'supply' | 'empty'
export interface PlanningOption {
  id: OptionId
  label: string
  minutes: number
  meanWidth: number
  worstWidth: number
  meanReduction: number
  worstReduction: number
  timePenalty: number
  score: number
}

export interface RobustPlan {
  recommended: PlanningOption
  baseline: PlanningOption
  options: PlanningOption[]
  ensembleSize: number
}

const ENSEMBLE_RATES = [0.35, 1.25, 2.7, 5.5]
const SOURCES = [0, 450, 900]
const SUPPLIES = [370, 430, 490]
const ROOM_OFFSETS = [-30, 0, 30]
const DUCT_OFFSETS = [-8, 8]
const RATES = Array.from({length: 161}, (_, i) => i / 20)

function validate(p: PlanningInput, c: PlanningConstraints) {
  const bounds = [
    [p.initial, 31, 10_000], [p.duration, 5, 480], [p.interval, 0.25, Math.min(p.duration, 15)],
    [p.noise, 0, 100], [p.occupancy, 0, 4], [c.maxMinutes, p.duration, 480], [c.extraHourPenalty, 0, 100],
  ]
  if (bounds.some(([x, lo, hi]) => !Number.isFinite(x) || x < lo || x > hi) ||
    !Number.isInteger(p.occupancy) || [p.supplyKnown, c.allowEmpty, c.allowSupply, c.allowPrecision].some(x => typeof x !== 'boolean'))
    throw new RangeError('Invalid planning settings. The time budget must accommodate the current measurement.')
}

interface Shape {
  curvature: number
  bestSource: number
  residual: number
}

/**
 * The expected observation minus nominal supply has the form a+b*exp(-r*t).
 * Precompute the projection of each planning world's unit exponential at candidate k.
 * A constant is itself e + k*phi, so its projection has zero residual and source k.
 */
function projectShapes(duration: number, interval: number): Shape[][] {
  const hours = Array.from({length: Math.ceil(duration / interval)}, (_, i) => i * interval / 60)
  hours.push(duration / 60)
  const shapes = ENSEMBLE_RATES.map(r => hours.map(t => Math.exp(-r * t)))
  const table: Shape[][] = ENSEMBLE_RATES.map(() => [])
  for (const k of RATES) {
    const e = hours.map(t => Math.exp(-k * t))
    const phi = hours.map(t => k === 0 ? t : -Math.expm1(-k*t)/k)
    let ee = 0, ep = 0
    for (let i = 0; i < hours.length; i++) {
      ee += e[i]*e[i]
      ep += e[i]*phi[i]
    }
    const orthogonal = phi.map((value, i) => value - e[i]*ep/ee)
    const curvature = orthogonal.reduce((sum, x) => sum + x*x, 0)
    shapes.forEach((shape, j) => {
      let ez = 0, pz = 0
      for (let i = 0; i < hours.length; i++) {
        ez += e[i] * shape[i]
        pz += orthogonal[i] * shape[i]
      }
      const bestSource = pz / curvature
      let residual = 0
      for (let i = 0; i < hours.length; i++) {
        const err = shape[i] - e[i]*ez/ee - orthogonal[i]*bestSource
        residual += err*err
      }
      table[j].push({curvature, bestSource, residual})
    })
  }
  return table
}

interface World { rateIndex: number; supply: number; roomOffset: number; ductOffset: number; source: number }

function worlds(occupancy: number) {
  const ensemble: World[] = []
  for (let rateIndex = 0; rateIndex < ENSEMBLE_RATES.length; rateIndex++)
    for (const source of occupancy ? SOURCES : [0])
      for (const supply of SUPPLIES)
        for (const roomOffset of ROOM_OFFSETS)
          for (const ductOffset of DUCT_OFFSETS)
            ensemble.push({rateIndex, source, supply, roomOffset, ductOffset})
  return ensemble
}

function worldWidth(p: PlanningInput, world: World, shapes: Shape[][]) {
  const {rateIndex, supply, roomOffset, ductOffset, source} = world
  const nominalSupply = p.supplyKnown ? supply + ductOffset : 420
  const delta = 30 + (p.supplyKnown ? 10 : 75)
  const steady = supply + roomOffset + p.occupancy*source/ENSEMBLE_RATES[rateIndex]
  const a = steady - nominalSupply, b = p.initial - steady
  const maxG = p.occupancy * 1200
  const losses = shapes[rateIndex].map((shape, i) => {
    const k = RATES[i]
    const h = a*k + b*shape.bestSource
    const constrained = Math.min(maxG + k*delta, Math.max(-k*delta, h))
    return b*b*shape.residual + shape.curvature*(constrained-h)**2
  })
  return compatibilitySpan(RATES, losses, p.noise).width
}

interface Candidate { id: OptionId; label: string; settings: PlanningInput }

function feasible(p: PlanningInput, c: PlanningConstraints): Candidate[] {
  const options: Candidate[] = [{id:'baseline', label:'Keep current measurement', settings:p}]
  if (p.duration < c.maxMinutes) options.push({id:'longer', label:'Extend the observation',
    settings:{...p,duration:Math.min(2*p.duration,c.maxMinutes)}})
  if (c.allowPrecision && p.noise > 1) options.push({id:'precision', label:'Halve sensor noise', settings:{...p,noise:p.noise/2}})
  if (c.allowSupply && !p.supplyKnown) options.push({id:'supply', label:'Measure supply CO₂', settings:{...p,supplyKnown:true}})
  if (c.allowEmpty && p.occupancy) options.push({id:'empty', label:'Observe an empty room', settings:{...p,occupancy:0}})
  return options
}

export function robustPlan(p: PlanningInput, constraints: Partial<PlanningConstraints> = {}): RobustPlan {
  const c = {...defaultPlanningConstraints,...constraints}
  validate(p,c)
  const shapesByDuration = new Map<number, Shape[][]>()
  const ensemble = worlds(p.occupancy)
  const evaluated = feasible(p,c).map(option => {
    const key = option.settings.duration
    let shapes = shapesByDuration.get(key)
    if (!shapes) {
      shapes = projectShapes(key, p.interval)
      shapesByDuration.set(key, shapes)
    }
    const widths = ensemble.map(world => worldWidth(option.settings, world, shapes))
    return {option,widths}
  })
  const base = evaluated[0].widths
  const mean = (x:number[]) => x.reduce((sum,v) => sum+v,0)/x.length
  const options = evaluated.map(({option, widths}) => {
    const reductions = base.map((w,i) => w-widths[i])
    const meanReduction = mean(reductions), worstReduction = Math.min(...reductions)
    const minutes = option.settings.duration
    const timePenalty = c.extraHourPenalty * (minutes-p.duration)/60
    const score = 0.5*(meanReduction+worstReduction) - timePenalty
    return {id:option.id,label:option.label,minutes,meanWidth:mean(widths),worstWidth:Math.max(...widths),
      meanReduction,worstReduction,timePenalty,score}
  })
  const baseline = options[0]
  // Treat sub-nanounit score differences as ties. Prefer current protocol, then shorter duration and fixed ID.
  const rounded = (x:number) => Math.round(x*1e9)
  options.sort((a,b) => rounded(b.score)-rounded(a.score) ||
    Number(b.id==='baseline')-Number(a.id==='baseline') || a.minutes-b.minutes || a.id.localeCompare(b.id,'en'))
  return {recommended:options[0], baseline, options, ensembleSize:ensemble.length}
}
