import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Planner } from './Planner'
import { repeatDefaults, repeatInputs, type ObservedWindow } from './recording-plan'
import type { PlanningInput } from './robust'
import { recordingReport, downloadReport } from './report'

const fields = [
  ['initial', 'Starting room CO₂', 'ppm', 31, 10000],
  ['duration', 'Observation duration', 'min', 5, 480],
  ['interval', 'Planned sampling interval', 'min', 0.25, 15],
  ['occupancy', 'Expected constant occupancy', 'people', 0, 4],
  ['noise', 'Assumed room sensor noise (SD)', 'ppm', 0, 100],
] as const

export default function RecordingPlan({ window: w }: { window: ObservedWindow }) {
  const [fieldsValue, setFields] = useState(() => repeatDefaults(w))
  const [inputs, setInputs] = useState<PlanningInput | null>(null)
  const [error, setError] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const ranking = useRef<HTMLDivElement>(null)
  useEffect(() => {
    title.current?.focus()
  }, [])
  useEffect(() => {
    if (inputs) ranking.current?.focus()
  }, [inputs])
  const result = w.result
  function edit(patch: Partial<typeof fieldsValue>) {
    setFields({ ...fieldsValue, ...patch })
    setInputs(null)
    setError('')
  }
  const value = (x: number | null | undefined, unit: string) =>
    x == null ? 'Unavailable' : Number(x.toFixed(3)) + ' ' + unit
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">
            <span className="badge-dot" /> Recording-based planning
          </div>
          <h1 ref={title} tabIndex={-1}>
            Plan my next measurement
          </h1>
          <p>
            Use the selected window to design a repeat. Its ventilation rate and sources remain
            unknown.
          </p>
        </div>
        <a className="subtle-btn" href="#explorer">
          Choose a recording
        </a>
      </div>
      <div className="analysis-grid">
        <section className="panel details-box">
          <h2>From the recording</h2>
          <p>
            <strong>{w.file}</strong> · {w.role === 'custom' ? 'Local import' : 'Bundled dataset'} ·
            Session {w.session} · rows {w.startRow}–{w.endRow}
          </p>
          <p>
            {w.startStamp} to {w.endStamp}
          </p>
          <dl className="metadata">
            {Object.entries({
              'First indoor CO₂': value(w.initial, 'ppm'),
              'Elapsed duration': value(w.duration, 'min'),
              'Median cadence': value(w.interval, 'min') + (w.irregular ? ' · irregular' : ''),
              Occupancy: w.occupancy === null ? 'Variable or unknown' : String(w.occupancy),
              'Valid supply CO₂ samples': w.supplyCount + ' / ' + w.input.room.length,
              'Rate-change diagnostic':(result.rate_change_check ?? 'unavailable').replaceAll('_',' '),
              'Physics estimate': value(result.rate_ach, 'h⁻¹'),
              'Log-linear estimate': value(result.baseline_ach, 'h⁻¹'),
              'Sensitivity range':
                result.sensitivity_low_ach == null
                  ? 'Unavailable'
                  : value(result.sensitivity_low_ach, '') +
                    '– ' +
                    value(result.sensitivity_high_ach, 'h⁻¹'),
            }).map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>Inference · {result.status.replaceAll('_', ' ')}</strong>
            <br />
            {[...new Set([result.reason, ...result.flags].filter(Boolean))]
              .map((f) => f.replaceAll('_', ' '))
              .join(' · ') || 'No diagnostic flags triggered.'}
          </p>
          <p>
            The sensitivity range reflects assumed sensor errors. Mechanical duct flow measures
            supplied air and can differ from effective room exchange.
          </p>
          <button className="subtle-btn" onClick={() => downloadReport(recordingReport(w))}>
            Download recording report
          </button>
        </section>
        <section className="panel details-box">
          <h2>Assumptions for a repeat</h2>
          <p>
            Review the observed starting values. A repeat assumes regular sampling and constant
            occupancy. Blank values need your input. Supply starts enabled only for a complete
            supply trace.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              try {
                setInputs(repeatInputs(fieldsValue))
                setError('')
              } catch (err) {
                setError(String(err))
              }
            }}
          >
            <div className="fields">
              {fields.map(([key, label, unit, min, max]) => (
                <label className="field" key={key}>
                  {label} ({unit})
                  <input
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={key === 'occupancy' ? 1 : 'any'}
                    value={fieldsValue[key]}
                    onChange={(e) => edit({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={fieldsValue.supplyKnown}
                onChange={(e) => edit({ supplyKnown: e.target.checked })}
              />
              Supply CO₂ will be measured
            </label>
            <p>
              Use repeatability data or a stated noise assumption for SD. Calibration bias is
              modeled separately across fixed offsets. If the sensor is uncharacterized, compare
              several plausible SDs.
            </p>
            <button className="primary">
              Evaluate repeat strategies <ArrowRight size={16} />
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
      {inputs && (
        <div
          ref={ranking}
          tabIndex={-1}
          role="region"
          aria-label="Prospective repeat strategies"
          className="analysis-grid recording-plan-results"
        >
          <Planner
            key={JSON.stringify(inputs)}
            design={inputs}
            onExport={(decision) => downloadReport(recordingReport(w, { inputs, decision }))}
          />
          <section className="panel details-box">
            <h2>What the ranking means</h2>
            <p>
              The ensemble varies ventilation, generation, supply concentration and calibration.
              Adjust the time budget and available actions under planning constraints.
            </p>
            <p>
              A projected reduction is a change in compatible width. To assess accuracy you need an
              independent measurement. Check sensor offsets and record fan or occupancy changes
              before interpreting a narrow range.
            </p>
            <a href="#methods">Inspect the synthetic failure cases</a>
          </section>
        </div>
      )}
    </>
  )
}
