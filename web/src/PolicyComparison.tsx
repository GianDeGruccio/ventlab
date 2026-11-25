import { useState } from 'react'
import study from '../fixtures/phase6-stress-summary.json'

export const policyNames = {
  unchanged: 'Keep current measurement',
  nominal: 'Configured scenario',
  rule: 'Simple feasible rule',
  robust: 'Robust ensemble',
}
const measures = {
  rateMAE: { label: 'Mean absolute rate error', unit: 'h⁻¹' },
  meanWidth: { label: 'Mean compatible width', unit: 'h⁻¹' },
  inside: { label: 'Target inside range', unit: 'trials' },
  narrowerWorseRate: { label: 'Narrower range and larger error', unit: 'trials' },
}
export function PolicyComparison() {
  const [caseName, setCase] = useState('')
  const [metric, setMetric] = useState<keyof typeof measures>('rateMAE')
  const { cases, summary } = study.evaluation
  const data = cases.find((c) => c.name === caseName)?.policies ?? summary
  const ids = Object.keys(policyNames) as (keyof typeof policyNames)[]
  const counts = metric === 'inside' || metric === 'narrowerWorseRate'
  const maxTime = Math.max(...ids.map((k) => data[k].meanMinutes))
  const maxMetric = counts ? data.robust.trials : Math.max(...ids.map((k) => data[k][metric]))
  const bias = cases.find((c) => c.name === 'Opposed calibration biases')!
  const drift = cases.find((c) => c.name === 'Drifting source and fan')!
  const bar = (n: number, max: number, label: string) => (
    <div className="evidence-value">
      <span>{label}</span>
      <div className="measure-track" aria-hidden="true">
        <i style={{ width: (max ? (n / max) * 100 : 0) + '%' }} />
      </div>
    </div>
  )
  return (
    <section className="policy-compare" aria-label="Interactive policy comparison">
      <h3>What does extra measurement time buy?</h3>
      <p>
        Read across each row to compare time with error. Switch the outcome to see when a narrower
        range missed the target.
      </p>
      <div className="fields">
        <label className="field">
          Stress case
          <select
            aria-label="Stress case"
            value={caseName}
            onChange={(e) => setCase(e.target.value)}
          >
            <option value="">All evaluation cases</option>
            {cases.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Outcome
          <select
            aria-label="Outcome"
            value={metric}
            onChange={(e) => setMetric(e.target.value as keyof typeof measures)}
          >
            {Object.entries(measures).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="policy-chart">
        <caption>
          {caseName || 'All eight cases'} · {data.robust.trials} paired trials
        </caption>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Mean time (min)</th>
            <th>
              {measures[metric].label} ({measures[metric].unit})
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.map((k) => (
            <tr key={k}>
              <th scope="row">{policyNames[k]}</th>
              <td>{bar(data[k].meanMinutes, maxTime, data[k].meanMinutes.toFixed(2))}</td>
              <td>
                {bar(
                  data[k][metric],
                  maxMetric,
                  counts ? data[k][metric] + ' / ' + data[k].trials : data[k][metric].toFixed(3),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Each column starts at zero and uses its own scale. Harmful narrowing counts paired trials
        with less width and more error than keeping the current measurement.
      </p>
      <details className="ledger">
        <summary>Why precision can mislead</summary>
        <p>
          With opposing calibration biases, improving precision reduced mean width from{' '}
          {bias.policies.unchanged.meanWidth.toFixed(3)} to{' '}
          {bias.policies.robust.meanWidth.toFixed(3)} h⁻¹ while error changed from{' '}
          {bias.policies.unchanged.rateMAE.toFixed(3)} to {bias.policies.robust.rateMAE.toFixed(3)}{' '}
          h⁻¹. Check sensors against an independent calibration reference.
        </p>
        <p>
          When the fan and source both drifted, the robust span contained the time-average rate in{' '}
          {drift.policies.robust.inside}/{drift.policies.robust.trials} trials. Log fan settings and
          occupancy changes, then examine stable periods separately.
        </p>
      </details>
    </section>
  )
}
