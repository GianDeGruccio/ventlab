import { useState, useMemo, useId } from 'react'
import { scaleSequential, interpolateRgbBasis, scaleLinear } from 'd3'
import { Grid2X2 } from 'lucide-react'
import type { experiment } from './design'
type Result = ReturnType<typeof experiment>
export type Probe = [number, number] | null
export function Surface({
  r,
  label = 'Identifiability map',
  limits,
  sharedProbe,
  onProbe,
  paired = false,
  empty = false,
}: {
  r: Result
  label?: string
  limits?: [number, number]
  sharedProbe?: Probe
  onProbe?: (p: Probe) => void
  paired?: boolean
  empty?: boolean
}) {
  const readoutId = useId()
  const [localProbe, setLocal] = useState<Probe>(null)
  const picked = sharedProbe === undefined ? localProbe : sharedProbe
  const setPicked = onProbe ?? setLocal
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
  const lo = limits?.[0] ?? Math.min(...r.surface.map((row) => Math.min(...row))),
    hi = limits?.[1] ?? Math.max(...r.surface.map((row) => Math.max(...row)))
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
  }, [r, lo, hi])
  return (
    <section className="panel analysis-panel">
      <div className="card-head">
        <Grid2X2 size={19} />
        <h2>{label}</h2>
      </div>
      <p>
        {paired
          ? 'Shared axes and residual scale · lower values fit better.'
          : 'Follow the pale band to find different sources and rates that fit the same trace.'}
      </p>
      <div className="plot-unit">Total generation (ppm/h)</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label + ' · Residual surface. Use arrow keys or point to inspect.'}
        aria-describedby={readoutId}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
          e.preventDefault()
          {
            const [i, j] = picked ?? [Math.floor(nx / 2), Math.floor(ny / 2)]
            setPicked([
              Math.max(
                0,
                Math.min(nx - 1, i + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)),
              ),
              Math.max(
                0,
                Math.min(ny - 1, j + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)),
              ),
            ])
          }
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
        {empty && (
          <line
            x1={L}
            x2={W - R}
            y1={yf(0.5)}
            y2={yf(0.5)}
            stroke="white"
            strokeDasharray="4 3"
            strokeWidth={1.3}
          />
        )}
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
        <span>{lo.toFixed(1)} ppm</span>
        <i />
        <span>{hi.toFixed(0)} ppm RMSE</span>
      </div>
      <div className="map-readout" id={readoutId}>
        {active
          ? `${r.rates[active[0]].toFixed(2)} h⁻¹ · ${r.sources[active[1]].toFixed(0)} ppm/h · RMSE ${r.surface[active[1]][active[0]].toFixed(1)} ppm`
          : r.nonUnique ? 'Non-unique fit · several rates explain these observations' : `Profile fit · ${r.fitRate.toFixed(2)} h⁻¹ · ${r.fitGeneration.toFixed(0)} ppm/h`}
      </div>
      {empty && (
        <p className="map-caveat">
          Empty room · the marked zero-source row contains the admissible fits.
        </p>
      )}
      <details>
        <summary>Surface assumptions</summary>
        <p>
          Each cell uses a constant rate and total source under the nominal background and
          calibration. Initial concentration is fitted. The color scale is logarithmic in excess
          RMSE above the scale minimum. A band of low residuals suggests ambiguity. For an empty
          room, the map still shows hypothetical sources, while both fitted trajectories enforce
          zero generation.
        </p>
      </details>
    </section>
  )
}
