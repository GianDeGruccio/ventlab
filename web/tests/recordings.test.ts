import { describe, expect, it } from 'vitest'
import { csvParseRows } from 'd3'
import train1 from '../../data/raw/training_data_1.csv?raw'
import train2 from '../../data/raw/training_data_2.csv?raw'
import evaluation from '../../data/raw/ventilation_test.csv?raw'
import ledger from '../../reports/windows.csv?raw'
import { inferWindow } from '../src/physics'
import {
  bundledFiles, csvHeaders, guessMapping, parseBundledRecording, parseCustomRecording,
  revealReference, scoreEstimate, windowInputs,
} from '../src/recordings'

const mapping = { time: 'time', room: 'room', occupancy: 'occupancy', supply: 'supply', flow: 'flow' }

function custom(lines: string[], volume = 36) {
  return parseCustomRecording(['time,room,occupancy,supply,flow', ...lines].join('\n'), 'custom', mapping, volume)
}

describe('source records and mechanical references', () => {
  it('matches the start, end, state and mechanical comparison of every archived period', () => {
    const csvs = [train1, train2, evaluation]
    const [header, ...rows] = csvParseRows(ledger)
    const col = (name: string) => header.indexOf(name)
    for (const [f, name] of bundledFiles.entries()) {
      const recording = parseBundledRecording(name, csvs[f])
      const archived = rows.filter(row => row[col('file')] === name)
      const selections = recording.sessions.flatMap(session => session.periods.map(period => ({ session, period })))
      expect(selections).toHaveLength(archived.length)
      for (const [i, { session, period }] of selections.entries()) {
        const row = archived[i]
        expect(session.id).toBe(Number(row[col('session')]))
        expect(period.state).toBe(row[col('state')])
        expect(session.rows[period.start].stamp).toBe(row[col('start')])
        expect(session.rows[period.end].stamp).toBe(row[col('end')])
        const reference = revealReference(recording, session, period.start, period.end)
        expect(reference.status).toBe(row[col('reference_status')])
        if (row[col('reference_ach')] === '') expect(reference.ach).toBeNull()
        else expect(reference.ach).toBeCloseTo(Number(row[col('reference_ach')]), 10)
      }
    }
  })

  it('keeps the exact blind window and inference when all flow measurements change', () => {
    const generate = (invalidFlow: boolean) => custom(Array.from({length: 31}, (_, i) =>
      [i * 60, 420 + 600 * Math.exp(-1.5 * i / 60), 0, 420, invalidFlow ? -i : 10].join(',')))
    const a = generate(false), b = generate(true)
    const inputA = windowInputs(a.sessions[0], 0, 30)
    const inputB = windowInputs(b.sessions[0], 0, 30)
    expect(a.sessions[0]).toEqual(b.sessions[0])
    expect(inputA).toEqual(inputB)
    expect(inferWindow(inputA).rate_ach).toBeCloseTo(1.5, 7)
    expect(inferWindow(inputB)).toEqual(inferWindow(inputA))
    expect(revealReference(a, a.sessions[0], 0, 30).status).toBe('usable')
    expect(revealReference(b, b.sessions[0], 0, 30).status).toBe('negative_flow')
    expect(() => revealReference(a, b.sessions[0], 0, 30)).toThrow(/belong/)
  })

  it('time-weights irregular reference readings and suppresses percentages at low flow', () => {
    const recording = custom(['0,900,0,420,0', '60,890,0,420,2', '180,880,0,420,5'])
    const session = recording.sessions[0]
    const reference = revealReference(recording, session, 0, 2)
    expect(reference.ach).toBeCloseTo(0.1 * (1 * 60 + 3.5 * 120) / 180, 12)
    const nearZero = revealReference(recording, session, 0, 1)
    expect(nearZero.status).toBe('near_zero')
    expect(scoreEstimate(1, nearZero)).toEqual({ absolute: 0.9, relativePercent: null })
    expect(scoreEstimate(undefined, reference)).toEqual({ absolute: null, relativePercent: null })
  })
})

describe('local CSV mapping and time axes', () => {
  it('supports quoted fields, BOM, explicit ISO offsets and empty measurements', () => {
    const text = '\uFEFFtimestamp,"indoor, ppm",people,flow_lps\r\n2025-11-24T05:00:00-02:00,700,0,2\r\n2025-11-24 07:01:00,,0,\r\n'
    const columns = csvHeaders(text)
    expect(columns).toEqual(['timestamp', 'indoor, ppm', 'people', 'flow_lps'])
    const guessed = guessMapping(columns)
    const parsed = parseCustomRecording(text, 'my.csv', {...guessed, room: 'indoor, ppm'})
    expect(parsed.hasSupply).toBe(false)
    const inputs = windowInputs(parsed.sessions[0], 0, 1)
    expect(inputs.timeS).toEqual([0, 60])
    expect(inputs.room[1]).toBeNaN()
    expect(inputs.supply).toBeUndefined()
    expect(inferWindow(inputs).reason).toBe('invalid_measurements')
    expect(revealReference(parsed, parsed.sessions[0], 0, 1).status).toBe('incomplete_flow')
  })

  it('requires volume for custom mechanical scoring and keeps missing flow unavailable', () => {
    const txt = 'time,room,occupancy,flow\n0,900,0,3\n60,880,0,5'
    const map = guessMapping(csvHeaders(txt))
    const noVolume = parseCustomRecording(txt, 'x.csv', map)
    expect(revealReference(noVolume, noVolume.sessions[0], 0, 1)).toEqual({ status: 'missing_volume', meanLps: 4, ach: null })
    const noFlow = parseCustomRecording(txt, 'x.csv', { ...map, flow: undefined }, 100)
    expect(revealReference(noFlow, noFlow.sessions[0], 0, 1).status).toBe('missing_flow_column')
    expect(() => parseCustomRecording(txt, 'x.csv', map, -1)).toThrow(/volume/)
  })

  it('keeps irregular samples, splits recording gaps and resets, and labels unknown occupancy', () => {
    const rec = custom(['0,900,0,420,1', '50,890,0,420,1', '110,880,1,420,1', '180,870,,420,1',
                        '1800,860,0,420,1', '1800,855,0,420,1', '1790,850,0,420,1'])
    expect(rec.sessions.map(s => s.rows.length)).toEqual([4, 1, 1, 1])
    expect(rec.sessions[0].periods.map(p => p.state)).toEqual(['unoccupied', 'occupied', 'unknown'])
    expect(() => windowInputs(rec.sessions[0], 0, 5)).toThrow(/bounds/)
    expect(revealReference(rec, rec.sessions[1], 0, 0).ach).toBeNull()
  })

  it('rejects ambiguous headers or mappings, impossible dates and malformed rows', () => {
    expect(() => csvHeaders('t,t\n0,0')).toThrow(/unique/)
    expect(() => csvHeaders('t,x\n0,1,2')).toThrow(/fields/)
    expect(() => csvHeaders('t,x')).toThrow(/observation/)
    expect(() => custom(['2025-02-30T10:10:00Z,800,0,430,1'])).toThrow(/row 1/)
    expect(() => parseCustomRecording('time,room,occupancy\n0,700,0', 'x',
      { time: 'time', room: 'room', occupancy: 'room' })).toThrow(/different/)
  })
})
