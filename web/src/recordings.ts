import { csvParseRows } from 'd3'
import train1Url from '../../data/raw/training_data_1.csv?url'
import train2Url from '../../data/raw/training_data_2.csv?url'
import testUrl from '../../data/raw/ventilation_test.csv?url'
import windowsUrl from '../../reports/windows.csv?url'
import metricsUrl from '../../reports/metrics.json?url'
import findingsUrl from '../../reports/findings.md?url'
import auditUrl from '../../reports/audit.json?url'

export const bundledFiles = ['training_data_1.csv', 'training_data_2.csv', 'ventilation_test.csv'] as const
export type BundledFile = typeof bundledFiles[number]
export const recordingUrls: Record<BundledFile, string> = {
  'training_data_1.csv': train1Url, 'training_data_2.csv': train2Url, 'ventilation_test.csv': testUrl,
}
export const benchmarkLinks = { windows: windowsUrl, metrics: metricsUrl, findings: findingsUrl, audit: auditUrl }

export interface ColumnMapping {
  time: string
  room: string
  occupancy: string
  supply?: string
  flow?: string
}

export interface Sample {
  timeS: number
  stamp: string
  room: number
  occupancy: number
  supply?: number
}

export interface Period {
  start: number
  end: number
  state: 'occupied' | 'unoccupied' | 'unknown'
}

export interface Session {
  id: number
  rows: Sample[]
  periods: Period[]
}

export interface Recording {
  name: string
  role: 'evaluation' | 'development' | 'custom'
  columns: string[]
  sessions: Session[]
  sampleCount: number
  hasSupply: boolean
  volumeM3: number | null
}

export interface Reference {
  status: 'invalid_time_or_no_interval' | 'incomplete_flow' | 'negative_flow' | 'near_zero' | 'usable' | 'missing_flow_column' | 'missing_volume'
  ach: number | null
  meanLps: number | null
}

// Only the explicit post-fit comparison reads this store. The public session
// samples, period labels and window inputs carry no airflow values.
const referenceFlows = new WeakMap<Session, number[]>()
const VOLUME_M3 = 2.69 * 2.71 * 3
const standardMap: ColumnMapping = {
  time: 'time', room: 'Room CO2 (ppm)', occupancy: 'Occupant count',
  supply: 'Supply air CO2 (ppm)', flow: 'Supply airflow (l/s)',
}

function readCsv(text: string) {
  const [columns, ...rows] = csvParseRows(text.replace(/^\uFEFF/, ''))
  if (!columns?.length || columns.some(c => !c.trim()) || new Set(columns).size !== columns.length) {
    throw new Error('Each CSV column needs a unique, nonempty heading.')
  }
  const data = rows.filter(row => row.length !== 1 || row[0].trim() !== '')
  if (!data.length) throw new Error('The CSV needs at least one observation.')
  const invalid = data.findIndex(row => row.length !== columns.length)
  if (invalid >= 0) throw new Error(`Data row ${invalid + 1} has a different number of fields from the header.`)
  return { columns, data }
}

export function csvHeaders(text: string): string[] {
  return readCsv(text).columns
}

export function guessMapping(columns: string[]): ColumnMapping {
  const match = (original: string, alternatives: string[]) => {
    const keys = [original, ...alternatives].map(s => s.toLowerCase())
    return keys.map(key => columns.find(column => column.trim().toLowerCase() === key)).find(Boolean) ?? ''
  }
  return {
    time: match(standardMap.time, ['timestamp', 'seconds', 'time_s', 'elapsed seconds', 'datetime']),
    room: match(standardMap.room, ['room', 'room_ppm', 'room_co2', 'co2', 'indoor co2']),
    occupancy: match(standardMap.occupancy, ['occupancy', 'occupants', 'people']),
    supply: match(standardMap.supply!, ['supply', 'supply_ppm', 'supply_co2']) || undefined,
    flow: match(standardMap.flow!, ['flow', 'flow_lps', 'supply_lps']) || undefined,
  }
}

function numeric(text: string) {
  if (!text.trim()) return NaN
  const n = Number(text)
  return Number.isFinite(n) ? n : NaN
}

// Treat zone-free laboratory clocks on a uniform axis, independent of the
// viewer's local time zone. Preserve original strings for display.
function seconds(raw: string) {
  const text = raw.trim()
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return numeric(text)
  const parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(text)
  if (!parts) return NaN
  const [, year, month, day, hour, minute, sec = '00', subsec = '', zone = 'Z'] = parts
  const civil = `${year}-${month}-${day}T${hour}:${minute}:${sec}`
  const unshifted = Date.parse(civil + 'Z')
  if (!Number.isFinite(unshifted) || !new Date(unshifted).toISOString().startsWith(civil + '.')) return NaN
  return Date.parse(civil + zone) / 1000 + Number('0' + subsec)
}

function state(occupancy: number): Period['state'] {
  if (!Number.isInteger(occupancy) || occupancy < 0 || occupancy > 4) return 'unknown'
  return occupancy === 0 ? 'unoccupied' : 'occupied'
}

function typicalStep(rows: Sample[]) {
  const positive = rows.slice(1).map((row, i) => row.timeS - rows[i].timeS).filter(dt => dt > 0).sort((a, b) => a - b)
  const half = Math.floor(positive.length / 2)
  if (!positive.length) return 0
  return positive.length % 2 ? positive[half] : (positive[half - 1] + positive[half]) / 2
}

function assemble(text: string, name: string, mapping: ColumnMapping, role: Recording['role'], volumeM3: number | null): Recording {
  if (volumeM3 !== null && (!Number.isFinite(volumeM3) || volumeM3 <= 0)) throw new Error('Room volume must be positive in m³.')
  const { columns, data } = readCsv(text)
  const selected = [mapping.time, mapping.room, mapping.occupancy]
  if (mapping.supply) selected.push(mapping.supply)
  if (mapping.flow) selected.push(mapping.flow)
  if (selected.some(column => !columns.includes(column))) throw new Error('Choose an existing column for time, room CO₂ and occupancy, and check any optional columns.')
  if (new Set(selected).size !== selected.length) throw new Error('Choose a different column for each measurement.')
  const indices = {
    time: columns.indexOf(mapping.time), room: columns.indexOf(mapping.room), occupancy: columns.indexOf(mapping.occupancy),
    supply: columns.indexOf(mapping.supply ?? ''), flow: columns.indexOf(mapping.flow ?? ''),
  }
  const samples = data.map((row, i): Sample => {
    const stamp = row[indices.time]
    const timeS = seconds(stamp)
    if (!Number.isFinite(timeS)) throw new Error(`Data row ${i + 1} needs a timestamp in ISO date-time format or elapsed seconds.`)
    const sample: Sample = { stamp, timeS, room: numeric(row[indices.room]), occupancy: numeric(row[indices.occupancy]) }
    if (indices.supply >= 0) sample.supply = numeric(row[indices.supply])
    return sample
  })

  const customStep = role === 'custom' ? typicalStep(samples) : 60
  const sessions: Session[] = []
  for (const [i, sample] of samples.entries()) {
    const delta = i ? sample.timeS - samples[i - 1].timeS : 0
    const newSession = role === 'custom' ? delta <= 0 || delta > 5 * customStep : delta !== 60
    if (!sessions.length || newSession) {
      const session: Session = { id: sessions.length + 1, rows: [], periods: [] }
      sessions.push(session)
      if (indices.flow >= 0) referenceFlows.set(session, [])
    }
    const session = sessions[sessions.length - 1]
    const index = session.rows.length
    const occupancy = state(sample.occupancy)
    const lastPeriod = session.periods[session.periods.length - 1]
    if (lastPeriod?.state === occupancy) lastPeriod.end = index
    else session.periods.push({ start: index, end: index, state: occupancy })
    session.rows.push(sample)
    if (indices.flow >= 0) referenceFlows.get(session)!.push(numeric(data[i][indices.flow]))
  }
  return { name, role, columns, sessions, sampleCount: samples.length, volumeM3, hasSupply: indices.supply >= 0 }
}

export function parseCustomRecording(text: string, name: string, mapping: ColumnMapping, volumeM3?: number): Recording {
  return assemble(text, name, mapping, 'custom', volumeM3 ?? null)
}

export function parseBundledRecording(file: BundledFile, text: string): Recording {
  return assemble(text, file, { ...standardMap, supply: file === 'training_data_1.csv' ? undefined : standardMap.supply },
    file === 'ventilation_test.csv' ? 'evaluation' : 'development', VOLUME_M3)
}

async function getText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the recording or report (HTTP ${response.status}).`)
  return response.text()
}

const cache = new Map<BundledFile, Recording>()
export async function loadRecording(file: BundledFile): Promise<Recording> {
  let recording = cache.get(file)
  if (!recording) {
    recording = parseBundledRecording(file, await getText(recordingUrls[file]))
    cache.set(file, recording)
  }
  return recording
}

function checkRange(session: Session, start: number, end: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= session.rows.length) {
    throw new Error('Choose inclusive row bounds within one session.')
  }
}

export function windowInputs(session: Session, start: number, end: number) {
  checkRange(session, start, end)
  const rows = session.rows.slice(start, end + 1)
  return {
    timeS: rows.map(r => r.timeS - rows[0].timeS),
    room: rows.map(r => r.room),
    occupancy: rows.map(r => r.occupancy),
    supply: rows[0].supply === undefined ? undefined : rows.map(r => r.supply!),
  }
}

export function revealReference(recording: Recording, session: Session, start: number, end: number): Reference {
  if (!recording.sessions.includes(session)) throw new Error('Session must belong to the selected recording.')
  checkRange(session, start, end)
  const absent = (status: Reference['status']): Reference => ({ status, ach: null, meanLps: null })
  if (start === end) return absent('invalid_time_or_no_interval')
  const flow = referenceFlows.get(session)
  if (!flow) return absent('missing_flow_column')
  const q = flow.slice(start, end + 1)
  if (q.some(v => !Number.isFinite(v))) return absent('incomplete_flow')
  if (q.some(v => v < 0)) return absent('negative_flow')
  let integrated = 0
  for (let i = start; i < end; i++) {
    const dt = session.rows[i+1].timeS - session.rows[i].timeS
    if (!Number.isFinite(dt) || dt <= 0) return absent('invalid_time_or_no_interval')
    integrated += (flow[i] + flow[i+1]) / 2 * dt
  }
  const meanLps = integrated / (session.rows[end].timeS - session.rows[start].timeS)
  if (recording.volumeM3 === null) return { status: 'missing_volume', meanLps, ach: null }
  return { status: meanLps <= 1 ? 'near_zero' : 'usable', meanLps, ach: meanLps * 3.6 / recording.volumeM3 }
}

export function scoreEstimate(rate: number | null | undefined, reference: Reference) {
  if (rate == null || !Number.isFinite(rate) || reference.ach === null) return { absolute: null, relativePercent: null }
  const absolute = Math.abs(rate - reference.ach)
  return { absolute, relativePercent: reference.status === 'usable' ? 100 * absolute / reference.ach : null }
}

export interface BenchmarkMetrics {
  periods: number
  unoccupied: number
  estimated: number
  scored: number
  mae_ach: number | null
  mape_percent: number | null
  paired_n: number
  paired_baseline_mae_ach: number | null
  paired_physics_mae_ach: number | null
  mean_sensitivity_width_ach: number | null
  inside_scenario_n: number
  scenario_comparable_n: number
  status: Record<string, number>
}

export async function loadBenchmark() {
  const [ledger, metricsText] = await Promise.all([getText(windowsUrl), getText(metricsUrl)])
  const { columns, data } = readCsv(ledger)
  return {
    windows: data.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])) as Record<string,string>),
    metrics: JSON.parse(metricsText) as Record<BundledFile, Record<string, BenchmarkMetrics>>,
  }
}
