import { PolicyComparison } from './PolicyComparison'
import { Download, TestTubes } from 'lucide-react'
import report from '../fixtures/phase3-stress-summary.json'
import fullReport from '../../reports/phase3-stress.json?url'
import protocol from '../fixtures/phase3-stress-protocol.json?url'
import costs from '../../reports/phase3-stress-timing.json?url'

const policies = {
  unchanged: 'Keep current measurement',
  nominal: 'Configured scenario¹',
  rule: 'Simple feasible rule²',
  robust: 'Robust ensemble',
}
export function StressEvidence() {
  const { summary, cases } = report.evaluation
  const robust = summary.robust
  return (
    <section className="panel details-box">
      <div className="card-head">
        <TestTubes size={20} />
        <h2>Independent synthetic stress test</h2>
      </div>
      <p>
        Eight fixed evaluation cases combine cycling ventilation, changing sources, correlated
        noise, sensor bias and weak contrast. Each method chose an action before observing the 32
        paired trials per case.
      </p>
      <PolicyComparison />
      <div
        className="table-wrap"
        role="region"
        aria-label="Stress benchmark by policy"
        tabIndex={0}
      >
        <table>
          <caption>Equal-weight evaluation · rate MAE and mean compatible width in h⁻¹</caption>
          <thead>
            <tr>
              <th>Planning policy</th>
              <th>Rate MAE</th>
              <th>Mean width</th>
              <th>Mean minutes</th>
              <th>Target inside range</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(policies) as (keyof typeof policies)[]).map((id) => {
              const m = summary[id]
              return (
                <tr key={id}>
                  <th>{policies[id]}</th>
                  <td>{m.rateMAE.toFixed(3)}</td>
                  <td>{m.meanWidth.toFixed(3)}</td>
                  <td>{m.meanMinutes.toFixed(2)}</td>
                  <td>
                    {m.inside}/{m.trials}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>
        Robust planning narrowed the range while increasing absolute rate error in{' '}
        <strong>
          {robust.narrowerWorseRate} of {robust.trials} trials
        </strong>
        . These ranges have no calibrated coverage probability. With varying ventilation, error uses
        the time-average rate over the chosen window.
      </p>
      <details className="ledger">
        <summary>Case results and planning policies</summary>
        <p>
          ¹ The Phase 2 planner receives a fixed nominal guess. ² The simple rule takes an
          empty-room repeat when feasible, then prefers longer observation, improved precision,
          supply measurement or an unchanged design. All four policies have the same feasible
          actions.
        </p>
        <div
          className="table-wrap"
          role="region"
          aria-label="Robust planning case results"
          tabIndex={0}
        >
          <table>
            <caption>Robust strategy versus unchanged design</caption>
            <thead>
              <tr>
                <th>Case</th>
                <th>Chosen action</th>
                <th>Rate MAE before → after</th>
                <th>Target inside after</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.name}>
                  <th>{c.name}</th>
                  <td>{c.policies.robust.action}</td>
                  <td>
                    {c.policies.unchanged.rateMAE.toFixed(3)} →{' '}
                    {c.policies.robust.rateMAE.toFixed(3)}
                  </td>
                  <td>
                    {c.policies.robust.inside}/{c.policies.robust.trials}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="linkbar">
        <a href={fullReport} download="phase3-stress.json">
          <Download />
          All paired outcomes
        </a>
        <a href={protocol} download="stress-protocol.json">
          <Download />
          Frozen protocol
        </a>
        <a href={costs} download="planning-cost.json">
          <Download />
          Computational costs
        </a>
        <a href="https://github.com/GianDeGruccio/ventlab/blob/main/docs/stress-protocol.md">
          Reproduce this study
        </a>
      </div>
    </section>
  )
}
