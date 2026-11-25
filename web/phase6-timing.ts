import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { writeFileSync } from 'node:fs'
import protocol from './fixtures/phase3-stress-protocol.json'
import { robustPlan } from './src/robust'
import { plannedDesign } from './stress-simulation'
const cases = [
  ...protocol.evaluation.map((c) => ({
    name: c.name,
    input: plannedDesign(c),
    constraints: {
      maxMinutes: c.cap,
      allowEmpty: !c.unavailable.includes('empty'),
      allowSupply: !c.unavailable.includes('supply'),
      allowPrecision: !c.unavailable.includes('precision'),
    },
  })),
  {
    name: 'Dense supported schedule',
    input: { ...plannedDesign(protocol.development[0]), duration: 480, interval: 0.25 },
    constraints: { maxMinutes: 480 },
  },
]
const samples = cases.map((c) => {
  robustPlan(c.input, c.constraints)
  const ms = Array.from({ length: 3 }, () => {
    const start = performance.now()
    robustPlan(c.input, c.constraints)
    return performance.now() - start
  })
  return { name: c.name, milliseconds: ms, medianMs: [...ms].sort((a, b) => a - b)[1] }
})
writeFileSync(
  '../reports/phase6/timing.json',
  JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, warmup: 1, samples }, null, 2) +
    '\n',
)
