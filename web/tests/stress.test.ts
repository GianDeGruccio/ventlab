import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import protocol from '../fixtures/phase3-stress-protocol.json'
import {stressTrace, assessTrial, feasible, plannedDesign, simpleRule} from '../stress-simulation'
import {planCase,protocolDigest,runStudy} from '../phase3-stress'
import {observe, recover, analyzeTrace} from '../src/design'

describe('Independent stress-study protocol and generator',()=>{
  it('binds the declared case definitions and seeds',()=>{
    const input=readFileSync(new URL('../fixtures/phase3-stress-protocol.json',import.meta.url))
    expect(createHash('sha256').update(input).digest('hex')).toBe(protocolDigest)
    expect(protocol.evaluation.length).toBe(8)
  })
  it('reproduces independent draws, and changes only the realization with seed',()=>{
    const c = protocol.development[0]
    const first=stressTrace(c,'baseline',31001)
    expect(first).toEqual(stressTrace(c,'baseline',31001))
    expect(first.observed).not.toEqual(stressTrace(c,'baseline',31002).observed)
    expect(stressTrace(c,'baseline',31002).targetRate).toBeCloseTo(first.targetRate,12)
  })
  it('honors physical half-blocks and the mean-rate target on a longer record',()=>{
    const c={...protocol.development[0], k:[0.5,3],g:[0,0],rho:0,jitter:.1,
      d:[1200,40,2,0,0,false],b:420,biases:[0,0,0,0]}
    for(const action of ['baseline','longer'] as const){
      const trace=stressTrace(c,action,31001)
      const hours=trace.settings.duration/60
      expect(trace.targetRate).toBeCloseTo(1.75,12)
      expect(trace.observed.at(-1)).toBeCloseTo(420+780*Math.exp(-1.75*hours),9)
      expect(trace.minutes.every((x,i)=>i===0||x>trace.minutes[i-1])).toBe(true)
    }
  })
  it('keeps room and duct calibration errors when random noise is halved',()=>{
    const c=protocol.development[1]
    const base=stressTrace(c,'baseline',31001),precise=stressTrace(c,'precision',31001)
    expect(base.minutes).toEqual(precise.minutes)
    expect(precise.settings.nominalSupply).toBe(base.settings.nominalSupply)
    expect(precise.observed[0]-Number(c.d[0])).toBeCloseTo((base.observed[0]-Number(c.d[0]))/2,11)
  })
  it('reuses the original Phase 2 recovery equations on a supplied trace',()=>{
    const d=plannedDesign(protocol.development[0])
    const {minutes,observed}=observe(d)
    expect(recover(d)).toEqual(analyzeTrace(minutes,observed,{...d,nominalSupply:420}))
    expect(()=>analyzeTrace([0,0],[500,495],{...d,nominalSupply:420})).toThrow()
  })
  it('keeps hidden physics and confirmation noise outside the planning inputs',()=>{
    const c=protocol.development[0]
    const swapped={...c,k:[7,0],g:[1100,70],b:590,rho:.98,biases:[50,20,-25,12]}
    expect(planCase(c)).toEqual(planCase(swapped))
    expect(stressTrace(c,'baseline',31022).observed).not.toEqual(stressTrace(swapped,'baseline',31022).observed)
  })
  it('uses the unchanged plan when all alternative actions are infeasible',()=>{
    const c={...protocol.development[1],cap:Number(protocol.development[1].d[1]),unavailable:['precision']}
    expect(simpleRule(c)).toBe('baseline')
    expect(new Set(Object.values(planCase(c).chosen))).toEqual(new Set(['baseline']))
    expect(()=>assessTrial(c,'empty',22)).toThrow('Infeasible')
  })
  it('respects time and sensor constraints for a capped survey',()=>{
    const c=protocol.evaluation[6]
    expect(feasible(c,'longer')).toBe(false)
    expect(feasible(c,'empty')).toBe(false)
    expect(simpleRule(c)).toBe('precision')
  })
})

describe('Released stress evidence',()=>{
  it('reproduces the full audit including every paired seed and action',()=>{
    const actual=runStudy()
    const released=JSON.parse(readFileSync(new URL('../../reports/phase3-stress.json',import.meta.url),'utf8'))
    expect(actual).toEqual(released)
    const compact=JSON.parse(readFileSync(new URL('../fixtures/phase3-stress-summary.json',import.meta.url),'utf8'))
    for (const key of ['development','evaluation'] as const){
      expect(compact[key].summary).toEqual(actual[key].summary)
      expect(compact[key].cases).toEqual(actual[key].cases.map(({name,policies})=>({name,policies})))
    }
  })
})
