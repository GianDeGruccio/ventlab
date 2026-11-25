import {useMemo,useState} from 'react'
import {GitCompareArrows} from 'lucide-react'
import {Surface, type Probe} from './Surface'
import {Chart} from './Chart'
import {chartSamples,compareErrors,type PairedResult} from './comparison-model'

export {compareMeasurement, type PairedResult} from './comparison-model'

export function Comparison({pair,guided,finishGuide}:{pair:PairedResult,guided:boolean,finishGuide:()=>void}){
  const [probe,setProbe]=useState<Probe>(null)
  const {first,second,before,after}=pair
  const t=useMemo(()=>chartSamples(first,second),[first,second])
  const limits=useMemo<[number,number]>(()=>{
    const values=[...first.surface.flat(),...second.surface.flat()]
    return [Math.min(...values),Math.max(...values)]
  },[first,second])
  const err=compareErrors(pair)
  const range=(r:typeof first)=>r.compatibleLow.toFixed(2)+'–'+r.compatibleHigh.toFixed(2)
  return <section className="paired">
    <div className="section-heading"><h2 id="comparison-title" tabIndex={-1}>Before &amp; after</h2><span>{pair.label}</span></div>
    {guided&&<div className="guide-panel"><div><small>Guided demo · 3 of 3</small><h2>Read the new decay</h2><p>Removing the simulated source breaks the balance. Check how much the compatible range narrowed and whether the fitted rate moved closer to the known rate.</p></div><button onClick={finishGuide} className="subtle-btn">Finish demo</button></div>}
    <section className="trajectory"><div className="trajectory-head"><div className="card-head"><GitCompareArrows size={20}/><h2>Paired CO₂ trajectories</h2></div><span className="dark-tag">Seed {before.seed}</span></div>
    <Chart dark title="Before and after observations on a shared time axis" minutes={t.minutes} traces={[
      {label:'Before model',values:t.firstTruth,color:'#65decb'},{label:'After model',values:t.secondTruth,color:'#f8b67b',style:'dash'},
      {label:'Before samples',values:t.before,color:'#8ae6db',style:'dots'},{label:'After samples',values:t.after,color:'#ffd19b',style:'dots'}]}/>
    <div className="trace-note">Shared time and concentration axes. Both experiments use the same seeded noise sequence. Matching traces can overlap.</div></section>
    <div className="panel details-box"><h2>Recovery from the simulated samples</h2>
      <div className="table-wrap"><table><caption>Compatible ranges use observed residuals. Lower error means closer to the known synthetic parameter.</caption><thead><tr><th>Measurement</th><th>Before</th><th>After</th></tr></thead><tbody>
      {[
        ['Duration (min)',before.duration,after.duration],
        ['Compatible rate range (h⁻¹)',range(first),range(second)],
        ['Range width (h⁻¹)',first.compatibleWidth.toFixed(2),second.compatibleWidth.toFixed(2)],
        ['True rate (h⁻¹)',before.rate.toFixed(2),after.rate.toFixed(2)],
        ['Fitted rate (h⁻¹)',first.fitRate.toFixed(2),second.fitRate.toFixed(2)],
        ['Absolute rate error (h⁻¹)',err.before.toFixed(2),err.after.toFixed(2)],
        ['True total source (ppm/h)',before.occupancy*before.generation,after.occupancy*after.generation],
        ['Fitted total source (ppm/h)',first.fitGeneration.toFixed(1),second.fitGeneration.toFixed(1)],
        ['Absolute source error (ppm/h)',Math.abs(first.fitGeneration-before.occupancy*before.generation).toFixed(1),Math.abs(second.fitGeneration-after.occupancy*after.generation).toFixed(1)]
      ].map(([k,a,b])=><tr key={k}><th>{k}</th><td>{a}</td><td>{b}</td></tr>)}</tbody></table></div>
      <p className="comparison-finding"><strong>{err.narrower?'The compatible range narrowed.':'The compatible range stayed as wide or grew.'}</strong>{' '}{err.improved?'The absolute rate error also fell.':'The absolute rate error did not improve.'} This is one paired synthetic run.</p>
    </div>
    <div className="analysis-grid"><Surface r={first} label="Before · identifiability" paired limits={limits} sharedProbe={probe} onProbe={setProbe}/><Surface r={second} label="After · identifiability" paired limits={limits} sharedProbe={probe} onProbe={setProbe}/></div>
  </section>
}
