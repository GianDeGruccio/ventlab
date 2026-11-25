import { repeatEligibility } from './repeat-eligibility'
import { useEffect, useId, useState } from 'react'
import { ArrowRight, Target } from 'lucide-react'
import stress from '../fixtures/phase6-stress-summary.json'
import type { Decision } from './report'
import { type experiment } from './design'
import {
  defaultPlanningConstraints,
  planningInputs,
  type OptionId,
  type PlanningConstraints,
  type PlanningInput,
  type RobustPlan,
} from './robust'

type Props = {
  design: PlanningInput
  result?: ReturnType<typeof experiment>
  onCompare?: (id: OptionId, minutes: number, label: string) => void
  onInvalidate?: () => void
  onExport: (d: Decision) => void
}

export function Planner({ design, result, onCompare, onInvalidate, onExport }: Props) {
  const [mode, setMode] = useState<'robust' | 'scenario'>('robust')
  const [constraints, setConstraints] = useState<PlanningConstraints>({
    ...defaultPlanningConstraints,
  })
  const [plan, setPlan] = useState<RobustPlan | null>(null)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<OptionId | null>(null)
  const group = useId()
  useEffect(() => {
    if (mode !== 'robust') return
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        setPlan(e.data.plan ?? null)
        setError(e.data.error ?? '')
      }
      worker.onerror = () => setError('Robust planning could not run. Change a setting to retry.')
      worker.postMessage({ inputs: planningInputs(design), constraints })
    } catch {
      setError('The browser could not start the planning worker. Reload to retry.')
    }
    return () => worker?.terminate()
  }, [design, constraints, mode])
  function invalidate() {
    setChosen(null)
    setPlan(null)
    setError('')
    onInvalidate?.()
  }
  function update(patch: Partial<PlanningConstraints>) {
    invalidate()
    setConstraints((old) => ({ ...old, ...patch }))
  }
  const options =
    mode === 'robust'
      ? (plan?.options ?? [])
      : (result?.strategies ?? []).map((s) => ({ ...s, id: s.id as OptionId }))
  const selected = options.find((o) => o.id === chosen) ?? options[0]
  const robust = mode === 'robust' ? plan?.options.find((o) => o.id === selected?.id) : null
  const eligibility =
    !result && selected ? repeatEligibility(design, selected.id, selected.minutes) : null
  return (
    <section className="panel analysis-panel planner">
      <div className="card-head">
        <Target size={20} />
        <h2>Measurement strategies</h2>
      </div>
      {result && (
        <div className="mode-switch" role="group" aria-label="Planning mode">
          {(['robust', 'scenario'] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                if (m !== mode) {
                  invalidate()
                  setMode(m)
                }
              }}
            >
              {m === 'robust' ? 'Robust ensemble' : 'Configured scenario'}
            </button>
          ))}
        </div>
      )}
      <p>
        {mode === 'robust'
          ? 'Plan across plausible rates, sources, supply concentrations and calibration errors.'
          : 'Use the configured room and source to predict the width of each repeat measurement.'}
      </p>
      {mode === 'robust' && (
        <details>
          <summary>Planning constraints</summary>
          <label className="field">
            Maximum observation time · {constraints.maxMinutes} min
            <input
              aria-label="Maximum observation time"
              type="range"
              min={design.duration}
              max={480}
              step={1}
              value={constraints.maxMinutes}
              onChange={(e) => update({ maxMinutes: +e.target.value })}
            />
          </label>
          <label className="field">
            Penalty per extra hour · {constraints.extraHourPenalty.toFixed(2)} h⁻¹
            <input
              aria-label="Penalty per extra hour"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={constraints.extraHourPenalty}
              onChange={(e) => update({ extraHourPenalty: +e.target.value })}
            />
          </label>
          {(
            [
              ['allowEmpty', 'Allow an empty room'],
              ['allowPrecision', 'Allow lower sensor noise'],
              ['allowSupply', 'Allow supply measurement'],
            ] as const
          ).map(([key, label]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={constraints[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </details>
      )}
      {mode === 'robust' && !plan && (
        <p role="status">{error || 'Calculating feasible strategies…'}</p>
      )}
      {selected && (
        <>
          <label className="field" htmlFor={group}>
            Measurement strategy
          </label>
          <select
            id={group}
            aria-label="Measurement strategy"
            value={selected.id}
            onChange={(e) => {
              setChosen(e.target.value as OptionId)
              onInvalidate?.()
            }}
          >
            {options.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.label}
              </option>
            ))}
          </select>
          {!eligibility && selected.id === 'empty' && (
            <p>
              Maintain the ventilation operating condition during the empty repeat. If the fan
              responds to occupancy, the new rate is a different target.
            </p>
          )}
          {eligibility && (
            <div className="guide-panel">
              <div>
                <h3>What this repeat can estimate</h3>
                <p>{eligibility.model}</p>
                <p>
                  <strong>{eligibility.empirical}</strong>
                </p>
                <p>
                  {eligibility.operatingCondition} {eligibility.evidence}
                </p>
              </div>
            </div>
          )}
          {robust ? (
            <div className="plan-metrics">
              <div>
                <small>Mean span reduction</small>
                <b>{signed(robust.meanReduction)} h⁻¹</b>
              </div>
              <div>
                <small>Worst paired reduction</small>
                <b>{signed(robust.worstReduction)} h⁻¹</b>
              </div>
              <div>
                <small>Time-adjusted score</small>
                <b>{signed(robust.score)} h⁻¹</b>
              </div>
            </div>
          ) : (
            <div className="strategy-baseline">
              Projected compatible width{' '}
              <strong>
                {result?.strategies.find((s) => s.id === selected.id)?.width.toFixed(2)} h⁻¹
              </strong>
            </div>
          )}
          {onCompare && (
            <button
              className="primary"
              onClick={() => onCompare(selected.id, selected.minutes, selected.label)}
            >
              Run comparison <ArrowRight size={16} />
            </button>
          )}
          <button
            className="subtle-btn"
            onClick={() =>
              onExport({
                mode,
                selected: selected.id,
                recommended: options[0].id,
                alternatives: mode === 'robust' ? plan!.options : result!.strategies,
                ...(mode === 'robust' && plan
                  ? {
                      constraints,
                      ensembleSize: plan.ensembleSize,
                      expectedInitialReadingPpm: design.initial,
                    }
                  : {}),
              })
            }
          >
            Download experiment report
          </button>
          <div className="control-status">
            {selected.minutes} min repeat
            {plan && mode === 'robust' ? ' · ' + plan.ensembleSize + ' planning scenarios' : ''}
          </div>
          <p className="planning-caution">
            <strong>Width and accuracy can disagree.</strong> In the revised synthetic study, robust
            planning narrowed the range and increased error in{' '}
            {stress.evaluation.summary.robust.narrowerWorseRate}/
            {stress.evaluation.summary.robust.trials} trials.{' '}
            <a href="#methods">Explore the failures</a>.
          </p>
          <details>
            <summary>Inspect ranking & assumptions</summary>
            {mode === 'robust' && plan ? (
              <>
                <p>
                  Score = half the mean reduction + half the smallest paired reduction − the
                  extra-time penalty. Negative reductions indicate wider spans. Scenarios carry
                  equal weight. Keeping the current measurement scores zero.
                </p>
                <p>
                  The starting sensor reading is set to {design.initial} ppm. The ensemble combines
                  four rates (0.35–5.5 h⁻¹), up to three source levels per person (0–900 ppm/h),
                  three supply concentrations (370–490 ppm), three room offsets (−30 to +30 ppm) and
                  two duct offsets (±8 ppm). The smallest gain applies only to these tested
                  scenarios.
                </p>
                <div
                  className="table-wrap"
                  role="region"
                  aria-label="Planning ensemble summary"
                  tabIndex={0}
                >
                  <table>
                    <caption>Modeled widths in h⁻¹ across a finite planning ensemble</caption>
                    <thead>
                      <tr>
                        <th>Strategy</th>
                        <th>Mean width</th>
                        <th>Worst width</th>
                        <th>Minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.options.map((o) => (
                        <tr key={o.id}>
                          <th>{o.label}</th>
                          <td>{o.meanWidth.toFixed(2)}</td>
                          <td>{o.worstWidth.toFixed(2)}</td>
                          <td>{o.minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <p>
                  The Phase 2 ranking uses the noise-free expected trace and known scenario
                  parameters. The largest width reduction ranks first. Its ranking has no time
                  penalty.
                </p>
                {(result?.strategies ?? []).map((s) => (
                  <p key={s.id}>
                    {s.label} · {signed(s.reduction)} h⁻¹ reduction · {s.minutes} min
                  </p>
                ))}
              </>
            )}
            <p>
              These are synthetic design scores. Accuracy and probability coverage require separate
              evaluation.
            </p>
          </details>
        </>
      )}
    </section>
  )
}
function signed(n: number) {
  return (Math.abs(n) < 0.005 ? 0 : n).toFixed(2)
}
