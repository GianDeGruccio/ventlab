import { experiment, interventions, type Design } from './design'
import type { OptionId } from './robust'

type Run = ReturnType<typeof experiment>
export interface PairedResult {
  before: Design
  after: Design
  first: Run
  second: Run
  label: string
  origin: 'plan' | 'teaching'
}
export function compareMeasurement(
  before: Design,
  first: Run,
  id: OptionId,
  minutes: number,
  label: string,
  origin: PairedResult['origin'] = 'plan',
): PairedResult {
  const option = interventions(before).find((o) => o.id === id)
  if (id !== 'baseline' && !option)
    throw new Error('This strategy is unavailable for the selected design.')
  const after = { ...(option?.design ?? before) }
  if (id === 'longer') {
    if (!Number.isFinite(minutes) || minutes <= before.duration || minutes > after.duration)
      throw new RangeError('Invalid extension duration.')
    after.duration = minutes
  }
  // Reuse the original source grid so equal pixels denote equal hypotheses on both maps.
  const second = id === 'baseline' ? first : experiment(after, first.sources.at(-1))
  return { before, after, first, second, label, origin }
}
export function chartSamples(first: Run, second: Run) {
  const minutes = [...new Set([...first.minutes, ...second.minutes])].sort((a, b) => a - b)
  function aligned(run: Run, values: number[]) {
    const byTime = new Map(run.minutes.map((t, i) => [t, values[i]]))
    return minutes.map((t) => byTime.get(t) ?? NaN)
  }
  return {
    minutes,
    before: aligned(first, first.observed),
    after: aligned(second, second.observed),
    firstTruth: aligned(first, first.truth),
    secondTruth: aligned(second, second.truth),
  }
}
export function compareErrors(pair: PairedResult) {
  const before = pair.first.nonUnique ? null : Math.abs(pair.first.fitRate - pair.before.rate),
    after = pair.second.nonUnique ? null : Math.abs(pair.second.fitRate - pair.after.rate)
  return {
    before,
    after,
    narrower: pair.second.compatibleWidth < pair.first.compatibleWidth - 1e-9,
    improved: before === null || after === null ? null : after < before - 1e-9,
  }
}
