import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import protocol from './fixtures/phase3-stress-protocol.json'
import {analyzeTrace,interventions,plannedWidth} from './src/design'
import {robustPlan} from './src/robust'
import {summarize,summarizePolicy} from './phase3-stress'
import {policies,actions,simpleRule,assessTrial,plannedDesign,feasible,type Action,type Policy,type StressCase} from './stress-simulation'

export function keyedStream(seed:number,tag:number) {
  let counter=0, index=8, block:Buffer
  return ()=>{
    if(index===8){
      block=createHash('sha256').update(`VentLab/RC1/${seed}/${tag}/${counter++}`).digest()
      index=0
    }
    return (block.readUInt32BE(4*index++)+.5)/4294967296
  }
}

export function matchedPlans(c:StressCase) {
  const d=plannedDesign(c)
  const prior=robustPlan(d,{maxMinutes:c.cap,allowEmpty:feasible(c,'empty'),allowSupply:feasible(c,'supply'),allowPrecision:feasible(c,'precision')})
  const width=plannedWidth(d)
  const options=prior.options.map(({id,minutes})=>{
    const next=interventions(d).find(o=>o.id===id)?.design ?? d
    const w=id==='baseline'?width:plannedWidth({...next,duration:minutes})
    return {id,minutes,width:w,score:width-w-.25*(minutes-d.duration)/60}
  })
  const rounded=(v:number)=>Math.round(v*1e9)
  options.sort((a,b)=>rounded(b.score)-rounded(a.score)||Number(b.id==='baseline')-Number(a.id==='baseline')||a.minutes-b.minutes||a.id.localeCompare(b.id,'en'))
  const chosen:Record<Policy,Action>={unchanged:'baseline',nominal:options[0].id,rule:simpleRule(c),robust:prior.recommended.id}
  return {chosen,nominal:options,robust:prior}
}
function studyCase(c:StressCase,start:number,emptyFactor=1) {
  const plan=matchedPlans(c)
  const byAction=new Map(actions.filter(a=>feasible(c,a)).map(action=>[action,
    Array.from({length:protocol.trialsPerCase},(_,i)=>assessTrial(c,action,start+i,analyzeTrace,keyedStream,emptyFactor))]))
  const base=byAction.get('baseline')!
  const metrics=(policy:Policy)=>{
    const action=plan.chosen[policy]
    return {action,...summarize(byAction.get(action)!,base)}
  }
  return {name:c.name,start,plan,policies:{unchanged:metrics('unchanged'),rule:metrics('rule'),nominal:metrics('nominal'),robust:metrics('robust')},
    alternatives:Object.fromEntries(byAction)}
}
type Row=ReturnType<typeof studyCase>
function aggregate(rows:Row[]) {
  return Object.fromEntries(policies.map(p=>[p,summarizePolicy(rows,p)])) as Record<Policy,ReturnType<typeof summarizePolicy>>
}
function split(cases:StressCase[],start:number) {
  const blocks=[0,1000000,2000000].map(offset=>{
    const rows=cases.map((c,i)=>studyCase(c,start+1000*i+offset))
    return {offset,summary:aggregate(rows),cases:rows}
  })
  const merged=cases.map((c,i)=>{
    const action=blocks[0].cases[i].plan.chosen
    const m=(p:Policy)=>{
      const samples=(a:Action)=>blocks.flatMap(b=>b.cases[i].alternatives[a]!)
      return {action:action[p],...summarize(samples(action[p]),samples('baseline'))}
    }
    return {name:c.name,policies:{nominal:m('nominal'),robust:m('robust'),rule:m('rule'),unchanged:m('unchanged')}}
  })
  return {blocks,summary:Object.fromEntries(policies.map(p=>[p,summarizePolicy(merged,p)])),cases:merged}
}
export function revisedStudy(){
  const responsive={...protocol.development[0],name:'Occupancy-responsive control'}
  return {version:'RC1',development:split(protocol.development,31000),evaluation:split(protocol.evaluation,731000),
    responsive:[0,1000000,2000000].map(offset=>studyCase(responsive,739000+offset,.5))}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const study=revisedStudy()
  writeFileSync('../reports/phase6/stress.json',JSON.stringify(study)+'\n')
  const {summary,cases,blocks}=study.evaluation
  writeFileSync('fixtures/phase6-stress-summary.json',JSON.stringify({version:study.version,evaluation:{summary,cases},blocks:blocks.map(b=>({offset:b.offset,summary:b.summary})),responsive:study.responsive.map(r=>({name:r.name,policies:r.policies}))},null,2)+'\n')
}
