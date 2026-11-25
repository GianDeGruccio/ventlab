import { useEffect, useState } from 'react'
import { BookOpen, Download, ExternalLink, FlaskConical } from 'lucide-react'
import { benchmarkLinks, bundledFiles, loadBenchmark, type BundledFile } from './recordings'
import synthetic from '../../reports/phase2-synthetic.json'
import syntheticUrl from '../../reports/phase2-synthetic.json?url'
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2))
const stat = (s: string) => (s ? Number(s).toFixed(2) : '—')
export default function Methods() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBenchmark>> | null>(null),
    [error, setError] = useState('')
  const [file, setFile] = useState<BundledFile>('ventilation_test.csv'),
    [page, setPage] = useState(0)
  useEffect(() => {
    let active = true
    loadBenchmark()
      .then((d) => {
        if (active) setData(d)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
    }
  }, [])
  const rows = data?.windows.filter((r) => r.file === file) ?? []
  const s = synthetic.evaluation.summary
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">
            <span className="badge-dot" />
            Scientific reference
          </div>
          <h1>Methods & evidence</h1>
          <p>Inspect the assumptions, recorded failures, and reproducible benchmarks.</p>
        </div>
      </div>
      <section className="panel details-box">
        <div className="card-head">
          <BookOpen size={20} />
          <h2>Retrospective evidence</h2>
        </div>
        <p>
          Three evaluation sessions come from one previously inspected room recording. The
          mechanical supply rate is an imperfect reference for effective ventilation. All 19
          original Python tests passed.
        </p>
        {error && <p role="alert">{error}</p>}
        {data && (
          <>
            <div className="table-wrap">
              <table>
                <caption>Mean absolute error on common scored windows (h⁻¹)</caption>
                <thead>
                  <tr>
                    <th>Recording</th>
                    <th>Common windows</th>
                    <th>Physics MAE</th>
                    <th>Baseline MAE</th>
                    <th>Flagged / fitted</th>
                  </tr>
                </thead>
                <tbody>
                  {bundledFiles.map((f) => {
                    const m = data.metrics[f].all
                    return (
                      <tr key={f}>
                        <th>{f}</th>
                        <td>{m.paired_n}</td>
                        <td>{fmt(m.paired_physics_mae_ach)}</td>
                        <td>{fmt(m.paired_baseline_mae_ach)}</td>
                        <td>
                          {m.status.flagged ?? 0} / {m.estimated}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p>
              In the test file the log-linear baseline had lower error on the nine common windows.
              Eleven of twelve physics fits triggered warnings. Only four of ten comparable
              references fell inside their sensor-scenario spans.
            </p>
            <details className="ledger">
              <summary>Browse all {data.windows.length} reported periods</summary>
              <label className="field">
                Ledger recording
                <select
                  aria-label="Ledger recording"
                  value={file}
                  onChange={(e) => {
                    setFile(e.target.value as BundledFile)
                    setPage(0)
                  }}
                >
                  {bundledFiles.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <div className="table-wrap">
                <table>
                  <caption>Rates in h⁻¹ · inclusive source periods</caption>
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>State</th>
                      <th>Status</th>
                      <th>Physics</th>
                      <th>Baseline</th>
                      <th>Reference</th>
                      <th>Reference status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(page * 12, page * 12 + 12).map((r) => (
                      <tr key={r.first_row}>
                        <th>{r.start}</th>
                        <td>{r.state}</td>
                        <td>{r.status}</td>
                        <td>{stat(r.rate_ach)}</td>
                        <td>{stat(r.baseline_ach)}</td>
                        <td>{stat(r.reference_ach)}</td>
                        <td>{r.reference_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button disabled={!page} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page + 1} of {Math.ceil(rows.length / 12)}
                </span>
                <button disabled={(page + 1) * 12 >= rows.length} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            </details>
          </>
        )}
        <div className="linkbar">
          <a href={benchmarkLinks.windows} download="windows.csv">
            <Download />
            Complete window ledger
          </a>
          <a href={benchmarkLinks.metrics} download="metrics.json">
            <Download />
            All metrics
          </a>
          <a href={benchmarkLinks.findings} download="Findings.md">
            <Download />
            Findings
          </a>
        </div>
      </section>
      <section className="panel details-box">
        <div className="card-head">
          <FlaskConical size={20} />
          <h2>Prospective synthetic evaluation</h2>
        </div>
        <p>
          Three development scenarios precede six separate evaluation scenarios, with 32 seeded
          noise draws per scenario. Each strategy is evaluated against known simulated parameters.
        </p>
        <div className="table-wrap">
          <table>
            <caption>Evaluation across {s.observations} seeded trials</caption>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Original design</th>
                <th>Recommended design</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Rate MAE (h⁻¹)</th>
                <td>{fmt(s.meanBaselineRateMAE)}</td>
                <td>{fmt(s.meanChosenRateMAE)}</td>
              </tr>
              <tr>
                <th>Mean compatible span (h⁻¹)</th>
                <td>{fmt(s.meanBaselineWidth)}</td>
                <td>{fmt(s.meanChosenWidth)}</td>
              </tr>
              <tr>
                <th>True rate inside span</th>
                <td>
                  {s.baselineInside}/{s.observations}
                </td>
                <td>
                  {s.chosenInside}/{s.observations}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The first-ranked strategy achieved the smallest observed mean span in{' '}
          {s.recommendedSmallestWidth} of {s.cases} scenarios. Mean width improved in{' '}
          {s.improvedMeanWidth}, and rate MAE improved in {s.improvedMeanRateMAE}. True-rate
          containment fell after applying the recommendations.
        </p>
        <a href={syntheticUrl} download="phase2-synthetic.json" className="text-link">
          <Download size={15} /> Full benchmark with seeds, assumptions and failures
        </a>
      </section>
      <section className="panel details-box methods-copy">
        <h2>Model & limitations</h2>
        <p className="equation">dC/dt = k(B − C) + G</p>
        <p>
          Time is in hours, concentrations C and B in ppm, exchange k in h⁻¹, and total source G in
          ppm/h. The browser integrates each time interval with its actual duration and left-held
          supply and generation. It fixes the empirical trajectory at the initial observed
          concentration and fits one constant rate by least squares.
        </p>
        <h3>When inference fails</h3>
        <p>
          An unknown time-varying source can explain the same trace at multiple rates. The empirical
          estimator abstains on occupied windows and valid decays shorter than ten minutes. A small
          concentration contrast, uncertain background, poor fit, search-bound solution, or
          inconsistent half-window rates can weaken a result. The baseline fits the slope of log
          excess over a fixed background.
        </p>
        <h3>Three different quantities</h3>
        <p>
          The empirical seven-scenario range measures sensitivity to sensor offsets and drift. The
          designer’s prospective width measures distinguishability on a bounded constant-source
          grid. Error compares an estimate with either a synthetic truth or the mechanical
          reference. Neither range has a calibrated confidence level.
        </p>
        <h3>Reference protocol</h3>
        <p>
          Analysis windows are selected using time and occupant count. Mechanical supply is accessed
          after inference, time-weighted with trapezoids, and converted using 3.6 × L/s ÷ volume in
          m³. Negative supply readings invalidate a window comparison. A nonnegative mean at or
          below 1 L/s permits absolute error only.
        </p>
        <h3>Data, software & AI use</h3>
        <p>
          Mikala, Xu and Huotari (2026),{' '}
          <em>Indoor occupancy ground truth dataset with variable ventilation</em>, CC BY 4.0. The
          early dataset used camera-based occupancy and an assumed 420 ppm background. The two later
          recordings have manually recorded occupancy and measured supply CO₂. VentLab’s original
          software uses the MIT license. OpenAI Codex assisted with implementation, documentation,
          and test authoring. The app calculates results locally.
        </p>
        <div className="linkbar">
          <a href="https://doi.org/10.5281/zenodo.18299691">
            Dataset & sensor specifications <ExternalLink />
          </a>
          <a href="https://github.com/GianDeGruccio/ventlab">
            Source repository <ExternalLink />
          </a>
          <a href={import.meta.env.BASE_URL + 'licenses.txt'} download="licenses.txt">
            Software & font notices <Download />
          </a>
        </div>
      </section>
    </>
  )
}
