import { useMemo, useState, useId } from 'react'
import { Surface } from './Surface'
import { downloadReport, simulationReport } from './report'
import { Planner } from './Planner'
import { Comparison, compareMeasurement, type PairedResult } from './Comparison'
import { planningInputs, type OptionId } from './robust'
import { useEffect } from 'react'
import {
  Activity,
  ArrowRight,
  ChevronDown,
  GitCompareArrows,
  FlaskConical,
  Layers3,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Waves,
} from 'lucide-react'
import { type Design, defaultDesign, experiment } from './design'
import { Chart } from './Chart'

type Numeric = Exclude<keyof Design, 'supplyKnown'>

function Slider({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  const id = useId()
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>
        {value} <small>{unit}</small>
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{
          background: `linear-gradient(to right, var(--teal) ${((value - min) / (max - min)) * 100}%, #d9e3e1 0%)`,
        }}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  )
}
export default function Designer() {
  const [draft, setDraft] = useState<Design>({ ...defaultDesign }),
    [applied, setApplied] = useState<Design>({ ...defaultDesign })
  const [expectedReading,setExpectedReading] = useState(1300)
  const planInput=useMemo(()=>planningInputs({...applied,initial:expectedReading}),[applied,expectedReading])
  const [run, setRun] = useState(0)
  const r = useMemo(() => experiment(applied), [applied])
  const [guide, setGuide] = useState(0)
  const [pair, setPair] = useState<PairedResult | null>(null)
  function runComparison(id: OptionId, minutes: number, label: string) {
    setPair(compareMeasurement(applied, r, id, minutes, label))
    setGuide(guide && id === 'empty' ? 3 : 0)
  }
  function startGuide() {
    const demo = {
      ...defaultDesign,
      initial: 520,
      supply: 420,
      rate: 2,
      generation: 200,
      occupancy: 1,
      noise: 0,
      supplyKnown: true,
    }
    setExpectedReading(520)
    setApplied(demo)
    setDraft(demo)
    setPair(null)
    setGuide(1)
  }
  useEffect(() => {
    const target = pair
      ? 'comparison-title'
      : guide === 2
        ? 'plan-title'
        : guide === 1
          ? 'guide-title'
          : null
    if (target) document.getElementById(target)?.focus()
  }, [pair, guide])
  const pending = JSON.stringify(draft) !== JSON.stringify(applied)
  function update(key: Numeric, n: number) {
    setDraft((d) => ({
      ...d,
      [key]: n,
      ...(key === 'duration' && d.interval > n ? { interval: n } : {}),
    }))
  }
  function slider(
    key: Numeric,
    label: string,
    unit: string,
    min: number,
    max: number,
    step: number,
  ) {
    return (
      <Slider
        {...{ label, unit, min, max, step }}
        value={draft[key]}
        onChange={(n) => update(key, n)}
      />
    )
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">
            <span className="badge-dot" />
            Synthetic measurement design
          </div>
          <h1>Experiment designer</h1>
          <p>
            Two ventilation rates can explain a similar CO₂ trace. Test which measurement helps tell
            them apart. Have a recording? <a href="#explorer">Plan from your measurements</a>.
          </p>
        </div>
        <div className="designer-actions">
          <button className="primary" onClick={startGuide}>
            <FlaskConical size={16} />
            Start guided demo
          </button>
          <button
            className="subtle-btn"
            onClick={() => {
              setDraft({ ...defaultDesign })
              setApplied({ ...defaultDesign })
              setExpectedReading(1300)
              setRun(0)
              setGuide(0)
              setPair(null)
            }}
          >
            <RotateCcw size={15} /> Reset experiment
          </button>
        </div>
      </div>
      {guide === 1 && (
        <section className="guide-panel">
          <div>
            <small>Guided demo · 1 of 3</small>
            <h2 id="guide-title" tabIndex={-1}>
              Why does the trace stay flat?
            </h2>
            <p>
              One occupant adds 200 ppm/h. Ventilation removes 2 × (520 − 420) = 200 ppm/h. At
              equilibrium the indoor sensor reads 520 ppm throughout, even with perfect precision.
            </p>
          </div>
          <button className="subtle-btn" onClick={() => setGuide(2)}>
            Inspect the map <ArrowRight size={16} />
          </button>
        </section>
      )}
      <div className="designer-grid">
        <section className="trajectory">
          <div className="trajectory-head">
            <div className="card-head">
              <div className="wave-icon">
                <Activity size={22} />
              </div>
              <h2>CO₂ trajectory</h2>
            </div>
            <span className="dark-tag">
              <i />
              Synthetic data
            </span>
          </div>
          <Chart
            dark
            title="Synthetic room CO₂ trajectory"
            minutes={r.minutes}
            traces={[
              { label: 'Model trajectory', values: r.truth, color: '#61dfc6' },
              { label: 'Observations', values: r.observed, color: '#f6fcff', style: 'dots' },
              { label: 'Alternative fit', values: r.alternative, color: '#f5b47f', style: 'dash' },
            ]}
          />
          <div className="plot-context">
            {r.minutes.length} samples over {applied.duration} min · sensor noise SD {applied.noise}{' '}
            ppm
          </div>
          <div className="instrument-stats">
            <div>
              <span>
                <Waves />
                Configured rate
              </span>
              <strong>
                {applied.rate.toFixed(2)} <small>h⁻¹</small>
              </strong>
            </div>
            <div>
              <span>
                <GitCompareArrows />
                Alternative rate
              </span>
              <strong>
                {r.alternativeRate.toFixed(2)} <small>h⁻¹</small>
              </strong>
            </div>
            <div>
              <span>
                <Layers3 />
                Alternative fit RMSE
              </span>
              <strong>
                {r.alternativeRmse.toFixed(1)} <small>ppm</small>
              </strong>
            </div>
          </div>
        </section>
        <aside className="panel controls">
          <div className="card-head">
            <SlidersHorizontal size={19} />
            <h2>Experiment settings</h2>
          </div>
          {slider('rate', 'Air-change rate', 'h⁻¹', 0, 8, 0.1)}
          {slider('initial', 'Physical initial room CO₂', 'ppm', 300, 3000, 10)}
          {slider('supply', 'Supply-air CO₂', 'ppm', 300, 1200, 5)}
          {slider('duration', 'Observation duration', 'min', 5, 240, 5)}
          <details>
            <summary>
              Sensor & occupancy settings <ChevronDown size={15} />
            </summary>
            {slider(
              'interval',
              'Sampling interval',
              'min',
              0.25,
              Math.min(15, draft.duration),
              0.25,
            )}
            {slider('noise', 'Sensor noise (SD)', 'ppm', 0, 100, 1)}
            {slider('offset', 'Room calibration offset', 'ppm', -100, 100, 1)}
            {slider('occupancy', 'Occupancy', 'people', 0, 4, 1)}
            {slider('generation', 'Generation per person', 'ppm/h', 0, 1200, 10)}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.supplyKnown}
                onChange={(e) => setDraft((d) => ({ ...d, supplyKnown: e.target.checked }))}
              />
              Measured supply CO₂
            </label>
          </details>
          <button
            className="primary"
            onClick={() => {
              setApplied({ ...draft })
              setPair(null)
              setGuide(0)
              setRun((n) => n + 1)
            }}
          >
            <Play size={15} fill="currentColor" />
            Run simulation
            <ArrowRight size={16} />
          </button>
          <div className="control-status" aria-live="polite">
            {pending
              ? 'Settings changed · run to apply'
              : run
                ? 'Simulation updated · seed ' + applied.seed
                : 'Deterministic simulation · seed ' + applied.seed}
          </div>
        </aside>
      </div>
      <div className="section-heading">
        <h2 id="plan-title" tabIndex={-1}>
          Choose the next measurement
        </h2>
      </div>
      {guide === 2 && (
        <section className="guide-panel">
          <div>
            <small>Guided demo · 2 of 3</small>
            <h2>Trace the band of fitting pairs</h2>
            <p>
              At equilibrium, generation = 100 × air-change rate. Every physically allowed pair
              along that line predicts the same CO₂ level. Try repeating the experiment after the
              occupant leaves. This fixed teaching example runs separately from the constrained plan.
            </p>
          </div>
          <button
            className="subtle-btn"
            onClick={() => runComparison('empty', applied.duration, 'Teaching example · Observe an empty room')}
          >
            Compare an empty room <ArrowRight size={16} />
          </button>
        </section>
      )}
      <div className="analysis-grid">
        <Surface r={r} empty={applied.occupancy === 0} />
        <div className="designer-plan">
          <label className="field panel details-box">Expected initial sensor reading for robust planning (ppm)
            <input type="number" min={31} max={10000} value={expectedReading || ''} onChange={e=>{setExpectedReading(Number(e.target.value));setPair(null)}}/>
            Set the expected instrument reading independently of the physical simulation.
          </label>
        <Planner
          key={JSON.stringify([applied,expectedReading])}
          design={planInput}
          result={r}
          onCompare={runComparison}
          onExport={(decision) => downloadReport(simulationReport(applied, r, decision, pair))}
          onInvalidate={() => {
            setPair(null)
            if (guide === 3) setGuide(0)
          }}
        />
        </div>
      </div>
      {pair && <Comparison pair={pair} guided={guide === 3} finishGuide={() => setGuide(0)} />}
      <div className="insight">
        <FlaskConical size={21} />
        <p>
          <strong>Alternative explanation.</strong> A rate of {r.alternativeRate.toFixed(2)} h⁻¹
          with total generation of {r.alternativeGeneration.toFixed(0)} ppm/h gives an observation
          RMSE of {r.alternativeRmse.toFixed(1)} ppm. Compare the dashed trace with the observations
          and the low-residual region on the map.
        </p>
      </div>
    </>
  )
}
