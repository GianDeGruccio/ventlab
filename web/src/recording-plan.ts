import { inferWindow } from './physics'
import { windowInputs, type Recording, type Session } from './recordings'
import type { PlanningInput } from './robust'

/** Only reference-blind observations cross this boundary. Row numbers are session-local. */
export function captureWindow(
  recording: Pick<Recording, 'name' | 'role'>,
  session: Session,
  start: number,
  end: number,
) {
  const input = windowInputs(session, start, end)
  const steps = input.timeS
    .slice(1)
    .map((t, i) => (t - input.timeS[i]) / 60)
    .sort((a, b) => a - b)
  const mid = Math.floor(steps.length / 2)
  const interval = steps.length
    ? (steps[mid] + steps[Math.floor((steps.length - 1) / 2)]) / 2
    : null
  const occupancy = input.occupancy[0]
  const constantCount =
    Number.isInteger(occupancy) &&
    occupancy >= 0 &&
    occupancy <= 4 &&
    input.occupancy.every((value) => value === occupancy)
  const supplyCount = input.supply?.filter((v) => Number.isFinite(v) && v > 0).length ?? 0
  return {
    file: recording.name,
    role: recording.role,
    session: session.id,
    startRow: start + 1,
    endRow: end + 1,
    startStamp: session.rows[start].stamp,
    endStamp: session.rows[end].stamp,
    input,
    initial: Number.isFinite(input.room[0]) ? input.room[0] : null,
    duration: input.timeS.at(-1)! / 60,
    interval,
    irregular: steps.length > 1 && steps.at(-1)! - steps[0] > 1e-6,
    occupancy: constantCount ? occupancy : null,
    supplyCount,
    result: inferWindow(input),
  }
}
export type ObservedWindow = ReturnType<typeof captureWindow>

// Unsupported measurements stay visible in the source summary. A blank requires an explicit assumption.
export function repeatDefaults(w: ObservedWindow) {
  const within = (n: number | null, lo: number, hi: number) =>
    n !== null && n >= lo && n <= hi ? String(n) : ''
  return {
    initial: within(w.initial, 31, 10000),
    duration: within(w.duration, 5, 480),
    interval: within(w.interval, 0.25, 15),
    occupancy: within(w.occupancy, 0, 4),
    noise: '',
    supplyKnown: w.supplyCount === w.input.room.length,
  }
}
export type RepeatFields = ReturnType<typeof repeatDefaults>
export function repeatInputs(fields: RepeatFields): PlanningInput {
  const read = (key: Exclude<keyof RepeatFields, 'supplyKnown'>, lo: number, hi: number) => {
    const n = Number(fields[key])
    if (!fields[key].trim() || !Number.isFinite(n) || n < lo || n > hi)
      throw Error('Check the planned ' + key + ' (' + lo + '–' + hi + ').')
    return n
  }
  const duration = read('duration', 5, 480),
    occupancy = read('occupancy', 0, 4)
  if (!Number.isInteger(occupancy)) throw Error('Enter a whole number of occupants.')
  return {
    initial: read('initial', 31, 10000),
    duration,
    interval: read('interval', 0.25, Math.min(15, duration)),
    occupancy,
    noise: read('noise', 0, 100),
    supplyKnown: fields.supplyKnown,
  }
}
