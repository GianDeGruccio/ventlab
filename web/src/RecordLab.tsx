import { useEffect, useState } from 'react'
import { Activity, ArrowRight, BookOpen, Database, Download, Eye, FileUp, LockKeyhole, ScanLine, SlidersHorizontal } from 'lucide-react'
import { Chart } from './Chart'
import { type ColumnMapping,type Recording,type Session,type BundledFile,type Reference, bundledFiles, recordingUrls, benchmarkLinks, loadRecording, windowInputs, revealReference, scoreEstimate, csvHeaders, guessMapping, parseCustomRecording } from './recordings'
import { inferWindow, type InferenceResult } from './physics'

export const rateText=(v?:number|null)=>v==null?'Unavailable':v.toFixed(2)+' h⁻¹'
const words=(s:string)=>s.replaceAll('_',' ')
function Upload({onLoad}:{onLoad:(r:Recording)=>void}){
  const [file,setFile]=useState<{text:string,name:string,cols:string[]}|null>(null),[mapping,setMapping]=useState<ColumnMapping>({time:'',room:'',occupancy:''}),[volume,setVolume]=useState(''),[error,setError]=useState('')
  const labels:Record<keyof ColumnMapping,string>={time:'Time (ISO or seconds)',room:'Room CO₂ (ppm)',occupancy:'Occupant count',supply:'Supply CO₂ (ppm, optional)',flow:'Supply airflow (L/s, optional)'}
  return <details className="panel upload"><summary><FileUp size={17}/> Import a local CSV</summary><p>Map your columns to analyze a recording in this browser. Use a consistent clock and enter missing readings as blank cells.</p>
    <label className="field">CSV file<input type="file" accept=".csv,text/csv" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setError('');setFile(null);try{if(f.size>4*1024*1024)throw Error('Choose a CSV under 4 MiB for interactive analysis.');const text=await f.text(),cols=csvHeaders(text);setFile({text,name:f.name,cols});setMapping(guessMapping(cols))}catch(e){setError(String(e))}}}/></label>
    {file&&<form onSubmit={e=>{e.preventDefault();try{onLoad(parseCustomRecording(file.text,file.name,mapping,volume.trim()?Number(volume):undefined));setError('');setFile(null)}catch(e){setError(String(e))}}}><div className="fields">{(Object.keys(labels) as (keyof ColumnMapping)[]).map(k=><label className="field" key={k}>{labels[k]}<select value={mapping[k]??''} required={['time','room','occupancy'].includes(k)} onChange={e=>setMapping({...mapping,[k]:e.target.value})}><option value="">Select column</option>{file.cols.map(c=><option key={c}>{c}</option>)}</select></label>)}<label className="field">Volume (m³, optional)<input type="number" step="any" min="0.00001" value={volume} onChange={e=>setVolume(e.target.value)}/></label></div><button className="primary">Load recording <ArrowRight size={15}/></button></form>}
    {error&&<p role="alert">{error}</p>}</details>
}
function ResultView({result:r,refValue,onReveal}:{result:InferenceResult,refValue:Reference|null,onReveal:()=>void}){
  return <section className="panel results" aria-live="polite"><div className="card-head"><ScanLine size={19}/><h2>Window inference</h2><span className="tag">{words(r.status)}</span></div>
    <div className="result-stats"><div><small>Physics estimate</small><strong>{rateText(r.rate_ach)}</strong></div><div><small>Log-linear estimate</small><strong>{rateText(r.baseline_ach)}</strong></div><div><small>Sensitivity range</small><strong>{r.sensitivity_low_ach==null?'Unavailable':r.sensitivity_low_ach.toFixed(2)+'–'+rateText(r.sensitivity_high_ach)}</strong></div></div>
    {r.reason&&<p><strong>Abstention.</strong> {words(r.reason)}</p>}{r.baseline_status!=='estimated'&&<p>Baseline status · {words(r.baseline_status)}</p>}
    <div className="flags">{r.flags.length?r.flags.map(f=><span key={f}>{words(f)}</span>):<span>No Phase 1 warnings triggered</span>}</div>
    <p>Room and supply sensor stress scenarios define the range. Its probability coverage is unknown.</p>
    {!refValue?<button className="subtle-btn" onClick={onReveal}><Eye size={16}/> Reveal mechanical reference</button>:<div className="reference"><strong>Mechanical supply reference · {rateText(refValue.ach)}</strong><p>{words(refValue.status)}{refValue.meanLps!==null&&' · '+refValue.meanLps.toFixed(2)+' L/s time-weighted mean'}</p>
    {(['Physics','Log-linear'] as const).map((method,i)=>{const err=scoreEstimate(i?r.baseline_ach:r.rate_ach,refValue);return <p key={method}>{method} absolute error · {rateText(err.absolute)}{err.relativePercent!==null?' · '+err.relativePercent.toFixed(1)+'% relative error':''}</p>})}
    <small>Mechanical airflow and effective room ventilation can differ.</small></div>}</section>
}

function WindowView({recording:r,session:s,blind}:{recording:Recording,session:Session,blind:boolean}){
  const [start,setStart]=useState(s.periods[0].start),[end,setEnd]=useState(s.periods[0].end)
  const [result,setResult]=useState<InferenceResult|null>(null),[refValue,setRef]=useState<Reference|null>(null)
  const [channel,setChannel]=useState<'co2'|'occupancy'>('co2')
  const n=s.rows.length,minutes=s.rows.map(row=>(row.timeS-s.rows[0].timeS)/60)
  function select(a:number,b:number){setStart(a);setEnd(b);setResult(null);setRef(null)}
  const periodIndex=s.periods.findIndex(p=>p.start===start&&p.end===end)
  const span=s.rows.slice(start,end+1),occupants=Array.from(new Set(span.map(x=>Number.isFinite(x.occupancy)?x.occupancy:'unknown'))).join(', ')
  return <><div className="designer-grid recording-grid"><section className="trajectory"><div className="trajectory-head"><div className="card-head"><div className="wave-icon"><Activity size={21}/></div><h2>Recording trace</h2></div><span className="dark-tag"><i/>{r.role==='custom'?'Local upload':'Measured data'}</span></div>
    <div className="chart-tabs">{(['co2','occupancy'] as const).map(c=><button key={c} aria-pressed={channel===c} onClick={()=>setChannel(c)}>{c==='co2'?'CO₂':'Occupancy'}</button>)}</div>
    <Chart dark title={'Session '+s.id+' '+channel} minutes={minutes} selected={blind?[minutes[start],minutes[end]]:undefined} unit={channel==='co2'?'ppm':'Occupancy (people)'} traces={channel==='co2'?[{label:'Room CO₂',values:s.rows.map(x=>x.room),color:'#61dfc6'},...(r.hasSupply?[{label:'Supply CO₂',values:s.rows.map(x=>x.supply!),color:'#f5b47f',style:'dash' as const}]:[])]:[{label:'Recorded count',values:s.rows.map(x=>x.occupancy),color:'#61dfc6'}]}/>
    <div className="trace-note">{blind?'Shading marks the selected window.':'The full uninterrupted session is shown.'} {s.rows[0].stamp} to {s.rows[n-1].stamp}</div>
  </section>
  {blind?<aside className="panel controls"><div className="card-head"><SlidersHorizontal size={18}/><h2>Measurement window</h2></div>
    <label className="field">Occupancy period<select value={periodIndex} onChange={e=>{const p=s.periods[+e.target.value];if(p)select(p.start,p.end)}}>{periodIndex<0&&<option value={-1}>Custom window</option>}{s.periods.map((p,i)=><option key={i} value={i}>{i+1} · {p.state} · {+minutes[p.start].toFixed(1)}–{+minutes[p.end].toFixed(1)} min</option>)}</select></label>
    <label className="field">Start · {+minutes[start].toFixed(2)} min<input type="range" min={0} max={n-1} value={start} onChange={e=>select(+e.target.value,Math.max(end,+e.target.value))}/></label>
    <label className="field">End · {+minutes[end].toFixed(2)} min<input type="range" min={0} max={n-1} value={end} onChange={e=>select(Math.min(start,+e.target.value),+e.target.value)}/></label>
    <p className="small">{end-start+1} observations · occupancy {occupants}</p>
    <button className="primary" onClick={()=>{setResult(inferWindow(windowInputs(s,start,end)));setRef(null)}}>Run both estimators <ArrowRight size={16}/></button><div className="control-status"><LockKeyhole size={12}/> {refValue?'Reference revealed below':'Airflow reference withheld'}</div>
  </aside>:<aside className="panel controls"><div className="card-head"><Database size={19}/><h2>Recording metadata</h2></div><dl className="metadata">{Object.entries({'Role':r.role,'Total samples':r.sampleCount,'Sessions':r.sessions.length,'Session samples':n,'Supply CO₂':r.hasSupply?'Measured':'Unmeasured','Room volume':r.volumeM3===null?'Unknown':r.volumeM3+' m³'}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></aside>}</div>
  {blind&&result&&<ResultView result={result} refValue={refValue} onReveal={()=>setRef(revealReference(r,s,start,end))}/>}
  {!blind&&<section className="panel details-box"><div className="card-head"><BookOpen size={18}/><h2>Source columns</h2></div><div className="chips">{r.columns.map(col=><span key={col}>{col}</span>)}</div></section>}
  </>
}
export default function RecordLab({blind,custom,onCustom,onBench}:{blind:boolean,custom:Recording|null,onCustom:(r:Recording)=>void,onBench:()=>void}){
  const [file,setFile]=useState<BundledFile|'custom'>(custom?'custom':'ventilation_test.csv'),[sid,setSid]=useState(0)
  const [recording,setRecording]=useState<Recording|null>(null),[error,setError]=useState('')
  useEffect(()=>{let live=true;setError('');setRecording(null);setSid(0)
    const req=file==='custom'?Promise.resolve(custom):loadRecording(file)
    req.then(r=>{if(live)setRecording(r)}).catch(e=>{if(live)setError(String(e))});return()=>{live=false}
  },[file,custom])
  return <><div className="page-heading"><div><div className="kicker"><span className="badge-dot"/>Empirical workspace</div><h1>{blind?'Blind validation':'Data explorer'}</h1><p>{blind?'Estimate ventilation from a recording, then reveal the mechanical reference.':'Inspect room measurements across recording sessions or import your own CSV.'}</p></div>{blind&&<button className="subtle-btn" onClick={onBench}><BookOpen size={16}/> Full benchmark</button>}</div>
    {!blind&&<Upload onLoad={r=>{onCustom(r);setFile('custom')}}/>}
    <div className="sourcebar"><label className="field">Recording<select value={file} onChange={e=>setFile(e.target.value as typeof file)}>{bundledFiles.map(f=><option key={f}>{f}</option>)}{custom&&<option value="custom">{custom.name} · upload</option>}</select></label>
    {recording&&<label className="field">Session<select value={sid} onChange={e=>setSid(+e.target.value)}>{recording.sessions.map((s,i)=><option value={i} key={s.id}>{s.id} · {s.rows[0].stamp}</option>)}</select></label>}
    {!blind&&file!=='custom'&&<a className="subtle-btn" download={file} href={recordingUrls[file]}><Download size={15}/>Original CSV</a>}</div>
    {error&&<p role="alert">{error}</p>}{!recording&&!error&&<p role="status">Loading recording…</p>}
    {recording&&recording.sessions[sid]&&<WindowView key={recording.name+sid+blind} recording={recording} session={recording.sessions[sid]} blind={blind}/>}
    <div className="insight"><Database size={21}/><p>{file==='custom'?'Custom files stay in browser memory. The Phase 1 model assumes a single well-mixed room and a maximum recorded occupancy of four.':'The bundled recordings come from one 21.8697 m³ experimental room. Ventilation test data were examined previously. The mechanical reference measures supply through the duct.'} {file!=='custom'&&<a href={benchmarkLinks.audit} download="audit.json">Download data audit</a>}</p></div>
  </>
}
