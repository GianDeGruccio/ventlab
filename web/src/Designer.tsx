import { useMemo, useState, useId } from 'react'
import { scaleSequential, interpolateRgbBasis, scaleLinear } from 'd3'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  Clock3,
  FlaskConical,
  Grid2X2,
  Layers3,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Waves,
} from 'lucide-react'
import { type Design, defaultDesign, experiment } from './design'
import { Chart } from './Chart'

type Numeric = Exclude<keyof Design, 'supplyKnown'>
type Result = ReturnType<typeof experiment>
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
function Surface({ r }: { r: Result }) {
  const [picked, setPicked] = useState<[number, number] | null>(null)
  const nx = r.rates.length,
    ny = r.sources.length,
    W = 440,
    H = 174,
    L = 48,
    T = 9,
    R = 12,
    B = 28
  const xf = scaleLinear()
      .domain([0, nx])
      .range([L, W - R]),
    yf = scaleLinear()
      .domain([0, ny])
      .range([H - B, T])
  const lo = Math.min(...r.surface.map((row) => Math.min(...row))),
    hi = Math.max(...r.surface.map((row) => Math.max(...row)))
  const color = scaleSequential(
    interpolateRgbBasis(['#e8b577', '#aedad0', '#46918e', '#254b5b', '#152c3e']),
  ).domain([0, Math.log1p(Math.max(1, hi - lo))])
  const active = picked && picked[0] < nx && picked[1] < ny ? picked : null
  const img = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = nx
    canvas.height = ny
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    r.surface.forEach((row, j) =>
      row.forEach((v, i) => {
        ctx.fillStyle = color(Math.log1p(Math.max(0, v - lo)))
        ctx.fillRect(i, ny - j - 1, 1, 1)
      }),
    )
    return canvas.toDataURL()
  }, [r])
  return (
    <section className="panel analysis-panel">
      <div className="card-head">
        <Grid2X2 size={19} />
        <h2>Identifiability map</h2>
      </div>
      <p>Explore which ventilation and generation pairs fit the same observations.</p>
      <div className="plot-unit">Total generation (ppm/h)</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Residual surface. Use arrow keys or point to inspect the ventilation and generation grid."
        tabIndex={0}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
          e.preventDefault()
          setPicked((previous) => {
            const [i, j] = previous ?? [Math.floor(nx / 2), Math.floor(ny / 2)]
            return [
              Math.max(
                0,
                Math.min(nx - 1, i + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)),
              ),
              Math.max(
                0,
                Math.min(ny - 1, j + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)),
              ),
            ]
          })
        }}
        onPointerMove={(e) => {
          const svg = e.currentTarget,
            p = svg.createSVGPoint()
          p.x = e.clientX
          p.y = e.clientY
          const m = svg.getScreenCTM()
          if (!m) return
          const v = p.matrixTransform(m.inverse())
          setPicked([
            Math.max(0, Math.min(nx - 1, Math.floor(xf.invert(v.x)))),
            Math.max(0, Math.min(ny - 1, Math.floor(yf.invert(v.y)))),
          ])
        }}
      >
        <image
          href={img}
          x={L}
          y={T}
          width={W - R - L}
          height={H - B - T}
          preserveAspectRatio="none"
        />
        {[...new Set([0, Math.floor((ny - 1) / 2), ny - 1])].map((j) => (
          <text textAnchor="end" x={L - 6} y={yf(j + 0.5) + 4} key={j}>
            {+r.sources[j].toFixed(0)}
          </text>
        ))}
        {[
          ...new Set([
            0,
            Math.round((nx - 1) / 4),
            Math.round((nx - 1) / 2),
            Math.round((3 * (nx - 1)) / 4),
            nx - 1,
          ]),
        ].map((i) => (
          <text textAnchor="middle" x={xf(i + 0.5)} y={H - 8} key={i}>
            {+r.rates[i].toFixed(2)}
          </text>
        ))}
        {active && (
          <circle
            cx={xf(active[0] + 0.5)}
            cy={yf(active[1] + 0.5)}
            r={4}
            fill="none"
            stroke="white"
            strokeWidth={2}
          />
        )}
      </svg>
      <div className="axis-caption">Air-change rate (h⁻¹)</div>
      <div className="scale-key">
        <span>Lower residual</span>
        <i />
        <span>Higher</span>
      </div>
      <div className="map-readout">
        {active
          ? `${r.rates[active[0]].toFixed(2)} h⁻¹ · ${r.sources[active[1]].toFixed(0)} ppm/h · RMSE ${r.surface[active[1]][active[0]].toFixed(1)} ppm`
          : `Best grid fit · ${r.fitRate.toFixed(2)} h⁻¹ · ${r.fitGeneration.toFixed(0)} ppm/h`}
      </div>
      <details>
        <summary>Surface assumptions</summary>
        <p>
          Each cell uses a constant rate and total source under the nominal background and
          calibration. Initial concentration is fitted. The color scale is logarithmic in excess
          RMSE above the best grid value. A band of low residuals suggests ambiguity. For an empty
          room, the map still shows hypothetical sources, while both fitted trajectories enforce
          zero generation.
        </p>
      </details>
    </section>
  )
}
export default function Designer() {
  const [draft, setDraft] = useState<Design>({ ...defaultDesign }),
    [applied, setApplied] = useState<Design>({ ...defaultDesign })
  const [run, setRun] = useState(0)
  const r = useMemo(() => experiment(applied), [applied])
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
            Simulation workspace
          </div>
          <h1>Experiment designer</h1>
          <p>Test what a CO₂ measurement can reveal about ventilation.</p>
        </div>
        <button
          className="subtle-btn"
          onClick={() => {
            setDraft({ ...defaultDesign })
            setApplied({ ...defaultDesign })
            setRun(0)
          }}
        >
          <RotateCcw size={15} /> Reset experiment
        </button>
      </div>
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
          <div className="instrument-stats">
            <div>
              <span>
                <Waves />
                Air-change rate
              </span>
              <strong>
                {applied.rate.toFixed(2)} <small>h⁻¹</small>
              </strong>
            </div>
            <div>
              <span>
                <Clock3 />
                Duration
              </span>
              <strong>
                {applied.duration} <small>min</small>
              </strong>
            </div>
            <div>
              <span>
                <Layers3 />
                Observations
              </span>
              <strong>
                {r.minutes.length} <small>samples</small>
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
          {slider('initial', 'Initial room CO₂', 'ppm', 300, 3000, 10)}
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
        <h2>Measurement design</h2>
        <span>Inference & uncertainty</span>
      </div>
      <div className="analysis-grid">
        <Surface r={r} />
        <section className="panel analysis-panel">
          <div className="card-head">
            <Target size={20} />
            <h2>Measurement strategies</h2>
          </div>
          <p>Ranked by the projected reduction in the compatible air-change rate span.</p>
          <div className="strategy-baseline">
            Current design span <strong>{r.width.toFixed(2)} h⁻¹</strong>
          </div>
          {r.strategies.map((s, i) => (
            <div className="strategy" key={s.id}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{s.label}</strong>
                <small>
                  {s.minutes} min · projected span {s.width.toFixed(2)} h⁻¹
                </small>
              </div>
              <span className="reduction">
                <ArrowDownRight size={14} />
                {s.reduction.toFixed(2)} h⁻¹
              </span>
            </div>
          ))}
          <details>
            <summary>How the ranking works</summary>
            <p>
              Each strategy repeats the measurement in simulation. Width is the span of grid rates
              compatible with an expected trace under the stated source and calibration bounds.
              Larger reductions rank first, with shorter duration breaking ties. This score does not
              measure accuracy or calibrated coverage.
            </p>
          </details>
        </section>
      </div>
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
