import { useId, useState } from 'react'
import { extent, line, scaleLinear } from 'd3'

export type Trace = {label:string, values:number[], color:string, style?:'dots'|'dash'|'line'}
type Props = {minutes:number[], traces:Trace[], unit?:string, title:string, dark?:boolean, selected?:[number,number]}
export function Chart({minutes,traces,title,dark=false,unit='ppm',selected}:Props) {
  const [focus,setFocus]=useState<number|null>(null)
  const [hidden,setHidden]=useState<string[]>([])
  const id=useId()
  if(!minutes.length) return <p>No observations in this period.</p>
  const show=traces.filter(s=>!hidden.includes(s.label))
  const values=show.flatMap(s=>s.values).filter(Number.isFinite)
  const [lo,hi]=extent(values)
  const first=minutes[0],last=minutes.at(-1)!
  const W=680,H=228,L=54,R=13,T=10,B=28
  const x=scaleLinear().domain([first,last>first?last:first+1]).range([L,W-R])
  const pad=Math.max(1,((hi??1)-(lo??0))*.1)
  const y=scaleLinear().domain([(lo??0)-pad,(hi??1)+pad]).nice(4).range([H-B,T])
  const path=line<number>().defined(Number.isFinite).x((_,i)=>x(minutes[i])).y(v=>y(v))
  const ix=focus===null?null:Math.min(focus,minutes.length-1)
  function nearest(target:number) {
    let best=0
    for(let i=1;i<minutes.length;i++) if(Math.abs(minutes[i]-target)<Math.abs(minutes[best]-target))best=i
    return best
  }
  return <div className={'chart '+(dark?'dark-chart':'')}>
    <div className="plot-unit">{unit==='ppm'?'CO₂ concentration (ppm)':unit}</div>
    <svg viewBox={`0 0 ${W} ${H}`} tabIndex={0} role="img" aria-labelledby={id} aria-label={title}
      onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setFocus(Math.max(0,Math.min(minutes.length-1,(ix??0)+(e.key==='ArrowRight'?1:-1))))}if(e.key==='Escape')setFocus(null)}}
      onPointerMove={e=>{const svg=e.currentTarget,p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const mat=svg.getScreenCTM();if(mat)setFocus(nearest(x.invert(p.matrixTransform(mat.inverse()).x)))}}
      onPointerLeave={()=>setFocus(null)}>
      <title id={id}>{title}. Use arrow keys to inspect samples.</title>
      {selected&&<rect x={x(selected[0])} y={T} width={Math.max(2,x(selected[1])-x(selected[0]))} height={H-B-T} fill={dark?'#61dfc6':'#13927d'} opacity={.14}/>}
      {y.ticks(4).map(v=><g key={v}><line className="grid" x1={L} x2={W-R} y1={y(v)} y2={y(v)}/><text x={L-10} y={y(v)+4} textAnchor="end">{v.toLocaleString()}</text></g>)}
      {x.ticks(6).map(v=><g key={v}><line className="grid vertical" x1={x(v)} x2={x(v)} y1={T} y2={H-B}/><text x={x(v)} y={H-7} textAnchor="middle">{+v.toFixed(2)}</text></g>)}
      {show.map(s=>s.style==='dots'?<g key={s.label}>{s.values.map((v,i)=>Number.isFinite(v)?<circle key={i} cx={x(minutes[i])} cy={y(v)} r={2.45} fill={s.color}/>:null)}</g>:<path key={s.label} d={path(s.values)??''} fill="none" stroke={s.color} strokeWidth={2.4} strokeDasharray={s.style==='dash'?'7 5':undefined}/>)}
      {ix!==null&&<line x1={x(minutes[ix])} x2={x(minutes[ix])} y1={T} y2={H-B} stroke={dark?'#fff':'#24434b'} strokeDasharray="3 4"/>}
    </svg>
    <div className="axis-caption">{ix===null?'Elapsed time (min)':<span>{+minutes[ix].toFixed(2)} min · {show.map(s=>s.label+' '+(Number.isFinite(s.values[ix])?s.values[ix].toFixed(1):'—')).join(' · ')}</span>}</div>
    <div className="legend">{traces.map(s=><button key={s.label} aria-pressed={!hidden.includes(s.label)} onClick={()=>setHidden(old=>old.includes(s.label)?old.filter(v=>v!==s.label):[...old,s.label])}><i className={s.style??'line'} style={{color:s.color}}/>{s.label}</button>)}</div>
  </div>
}
