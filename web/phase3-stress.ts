/** Frozen-policy stress comparison. Run from web with npm run stress. */
import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {cpus} from 'node:os'
import {performance} from 'node:perf_hooks'
import {pathToFileURL} from 'node:url'
import protocol from './fixtures/phase3-stress-protocol.json'
import {interventions, plannedWidth} from './src/design'
import {planningInputs, robustPlan} from './src/robust'
import {actions, assessTrial, feasible, plannedDesign, policies, simpleRule,
  type Action, type Policy, type StressCase} from './stress-simulation'

const mean = (values: number[]) => values.reduce((s,x)=>s+x,0)/values.length
const epsilon = 1e-9
export const protocolDigest = '48071511f08fa9f5fb947981edb82d4330a62a6dddab03c203439c56fed65dc2'

function checkProtocol() {
  const bytes = readFileSync(new URL('./fixtures/phase3-stress-protocol.json',import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== protocolDigest) {
    throw new Error('Benchmark inputs differ from the frozen Phase 3 protocol')
  }
}

/** Use Phase 2's unpenalized objective and original tie-break among the feasible designs. */
function nominalPlan(c: StressCase) {
  const d = plannedDesign(c)
  const width = plannedWidth(d)
  const options = interventions(d).filter(p=>feasible(c,p.id as Action)).map(p=>{
    const proposal = {...p.design, duration:Math.min(p.design.duration,c.cap)}
    return {id:p.id as Action, reduction:width-plannedWidth(proposal), minutes:proposal.duration}
  }).sort((a,b)=>b.reduction-a.reduction || a.minutes-b.minutes || a.id.localeCompare(b.id))
  return {action:options[0]?.id ?? 'baseline', options, width}
}

function robust(c: StressCase) {
  return robustPlan(planningInputs(plannedDesign(c)), {
    maxMinutes:c.cap, extraHourPenalty:.25, allowEmpty:!c.unavailable.includes('empty'),
    allowPrecision:!c.unavailable.includes('precision'), allowSupply:!c.unavailable.includes('supply'),
  })
}

export function planCase(c: StressCase) {
  const prior = robust(c)
  const nominal = nominalPlan(c)
  const chosen: Record<Policy,Action> = {
    unchanged:'baseline', nominal:nominal.action, rule:simpleRule(c), robust:prior.recommended.id,
  }
  const nominalWidths = 1+nominal.options.length
  const robustWidths = prior.ensembleSize * prior.options.length
  return {
    chosen, nominal, robust:prior,
    operations: {
      nominalWidthEvaluations:nominalWidths, nominalCandidateRateLosses:161*nominalWidths,
      robustWidthEvaluations:robustWidths, robustCandidateRateLosses:161*robustWidths,
      ruleWidthEvaluations:0, unchangedWidthEvaluations:0,
    },
  }
}

type Trial = ReturnType<typeof assessTrial>
function summarize(runs: Trial[], baseline: Trial[]) {
  const count = runs.length
  if (!count || baseline.length!==count || runs.some((x,i)=>x.seed!==baseline[i].seed)) {
    throw new Error('Paired seed mismatch')
  }
  return {
    trials:count, rateMAE:mean(runs.map(x=>x.rateError)), sourceMAE:mean(runs.map(x=>x.sourceError)),
    meanWidth:mean(runs.map(x=>x.width)), inside:runs.filter(x=>x.inside).length,
    meanRMSE:mean(runs.map(x=>x.rmse)), boundary:runs.filter(x=>x.boundary).length,
    meanMinutes:mean(runs.map(x=>x.minutes)),
    narrower:runs.filter((x,i)=>x.width < baseline[i].width-epsilon).length,
    wider:runs.filter((x,i)=>x.width > baseline[i].width+epsilon).length,
    improvedRate:runs.filter((x,i)=>x.rateError < baseline[i].rateError-epsilon).length,
    harmedRate:runs.filter((x,i)=>x.rateError > baseline[i].rateError+epsilon).length,
    narrowerWorseRate:runs.filter((x,i)=>x.width<baseline[i].width-epsilon && x.rateError>baseline[i].rateError+epsilon).length,
    meanNetWidthGain:mean(runs.map((x,i)=>baseline[i].width-x.width-.25*(x.minutes-baseline[i].minutes)/60)),
  }
}

function studyCase(c: StressCase, firstSeed: number) {
  const plan = planCase(c) // The decisions are fixed before the independent draws are generated.
  const runs = new Map<Action,Trial[]>()
  for (const id of actions.filter(id=>feasible(c,id))) {
    runs.set(id, Array.from({length:protocol.trialsPerCase}, (_,i)=>assessTrial(c,id,firstSeed+i)))
  }
  const baseline = runs.get('baseline')!
  const policyResult = (policy: Policy) => {
    const action = plan.chosen[policy]
    const selected = runs.get(action)
    if (!selected) throw new Error('Policy selected an infeasible action')
    return {action, ...summarize(selected,baseline)}
  }
  return {name:c.name, firstSeed, inputs:c, plan,
    policies: {unchanged:policyResult('unchanged'), nominal:policyResult('nominal'),
      rule:policyResult('rule'), robust:policyResult('robust')},
    alternatives:Object.fromEntries([...runs].map(([id,observations])=>[id,{...summarize(observations,baseline),observations}])),
  }
}

type CaseResult = ReturnType<typeof studyCase>
function summarizePolicy(rows: CaseResult[], policy: Policy) {
  const selected = rows.map(row=>row.policies[policy])
  const sum = (values:number[]) => values.reduce((s,x)=>s+x,0)
  const delta = rows.map(r=>r.policies[policy].rateMAE-r.policies.unchanged.rateMAE)
  const worst = delta.indexOf(Math.max(...delta))
  // Each scenario has the same number of seeds. Report counts explicitly.
  return {
    trials:sum(selected.map(x=>x.trials)), rateMAE:mean(selected.map(x=>x.rateMAE)),
    sourceMAE:mean(selected.map(x=>x.sourceMAE)), meanWidth:mean(selected.map(x=>x.meanWidth)),
    inside:sum(selected.map(x=>x.inside)), meanRMSE:mean(selected.map(x=>x.meanRMSE)),
    boundary:sum(selected.map(x=>x.boundary)), meanMinutes:mean(selected.map(x=>x.meanMinutes)),
    meanNetWidthGain:mean(selected.map(x=>x.meanNetWidthGain)),
    narrower:sum(selected.map(x=>x.narrower)), wider:sum(selected.map(x=>x.wider)),
    improvedRate:sum(selected.map(x=>x.improvedRate)), harmedRate:sum(selected.map(x=>x.harmedRate)),
    narrowerWorseRate:sum(selected.map(x=>x.narrowerWorseRate)),
    widthImprovedCases:rows.filter(r=>r.policies[policy].meanWidth<r.policies.unchanged.meanWidth-epsilon).length,
    rateImprovedCases:delta.filter(x=>x < -epsilon).length,
    rateHarmedCases:delta.filter(x=>x > epsilon).length,
    maxCaseMAEIncrease:delta[worst], maxCaseMAEIncreaseName:rows[worst].name,
    narrowerWorseCases:rows.filter((r,i)=>
      r.policies[policy].meanWidth<r.policies.unchanged.meanWidth-epsilon && delta[i]>epsilon).map(r=>r.name),
  }
}

function split(cases: StressCase[], start: number) {
  const rows = cases.map((c,i)=>studyCase(c,start+1000*i))
  return {summary:{
    unchanged:summarizePolicy(rows,'unchanged'), nominal:summarizePolicy(rows,'nominal'),
    rule:summarizePolicy(rows,'rule'), robust:summarizePolicy(rows,'robust'),
  }, cases:rows}
}

export function runStudy() {
  checkProtocol()
  return {protocolDigest, protocol, development:split(protocol.development,31000),
    evaluation:split(protocol.evaluation,731000)}
}

function timing() {
  // Timings depend on the host. Report independently so the scientific JSON is byte-stable.
  const costs = (c: StressCase, policy: Policy) => {
    const fn: Record<Policy,()=>unknown> = {
      robust:()=>robust(c), nominal:()=>nominalPlan(c), rule:()=>simpleRule(c), unchanged:()=>'baseline',
    }
    fn[policy]()
    const times = Array.from({length:11},()=>{
      const t=performance.now(); fn[policy](); return performance.now()-t
    }).sort((a,b)=>a-b)
    return {minMs:times[0],medianMs:times[5],maxMs:times[10]}
  }
  return {node:process.version, platform:process.platform, cpu:cpus()[0]?.model, warmup:1, repetitions:11,
    cases:protocol.evaluation.map(c=>({name:c.name, operations:planCase(c).operations,
      planningTime:Object.fromEntries(policies.map(p=>[p,costs(c,p)]))}))}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--timing')) {
    console.log(JSON.stringify(timing(),null,2))
  } else {
    const report = runStudy()
    const compact = (s: ReturnType<typeof split>) => ({summary:s.summary,
      cases:s.cases.map(({name, policies})=>({name, policies}))})
    const json = (v:unknown) => JSON.stringify(v, null, 2)+'\n'
    writeFileSync(new URL('../reports/phase3-stress.json',import.meta.url),json(report))
    writeFileSync(new URL('./fixtures/phase3-stress-summary.json',import.meta.url),json({
      protocolDigest, development:compact(report.development), evaluation:compact(report.evaluation),
    }))
    console.log(json(report.evaluation.summary))
  }
}
