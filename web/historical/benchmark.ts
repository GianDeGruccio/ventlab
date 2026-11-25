/**
 * Run with npm run benchmark from web/. Separate design planning from assessment:
 * the ranking uses expected traces; all outcomes below use independently seeded noise.
 */
import { writeFileSync } from 'node:fs'
import { defaultDesign, interventions, recommend, recover, type Design } from './design'

interface Case {
  name: string
  settings: Partial<Design>
}

const development: Case[] = [
  { name: 'Occupied transient', settings: { rate: 1.55, initial: 1370, generation: 370 } },
  {
    name: 'Known empty decay',
    settings: { rate: 2.35, supply: 460, initial: 1660, occupancy: 0, supplyKnown: true },
  },
  {
    name: 'Short noisy record',
    settings: { rate: 0.85, duration: 14, interval: 2, noise: 37, occupancy: 2 },
  },
]

const evaluation: Case[] = [
  {
    name: 'Slow occupied transient',
    settings: { rate: 0.72, initial: 1350, supply: 445, duration: 44, generation: 510, offset: 12 },
  },
  {
    name: 'Near steady state',
    settings: { rate: 2.1, initial: 665, supply: 425, generation: 500, interval: 3, noise: 25 },
  },
  {
    name: 'Fast empty decay',
    settings: {
      rate: 3.82,
      initial: 1550,
      supply: 430,
      duration: 32,
      interval: 1,
      occupancy: 0,
      supplyKnown: true,
    },
  },
  {
    name: 'Weak empty contrast',
    settings: {
      rate: 1.17,
      initial: 455,
      supply: 432,
      duration: 25,
      interval: 2,
      occupancy: 0,
      noise: 27,
    },
  },
  {
    name: 'Strong source, short record',
    settings: {
      rate: 2.67,
      initial: 840,
      supply: 460,
      generation: 660,
      occupancy: 3,
      duration: 20,
      noise: 22,
      offset: -18,
    },
  },
  {
    name: 'Background/calibration stress',
    settings: {
      rate: 1.39,
      initial: 950,
      supply: 560,
      offset: 65,
      duration: 70,
      occupancy: 0,
      noise: 11,
    },
  },
]
const trials = 32
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

function assess(design: Design, firstSeed: number) {
  const trialsData = Array.from({ length: trials }, (_, i) =>
    recover({ ...design, seed: firstSeed + i }),
  )
  return {
    rateMAE: mean(trialsData.map((r) => Math.abs(r.rate - design.rate))),
    sourceMAE: mean(
      trialsData.map((r) => Math.abs(r.generation - design.generation * design.occupancy)),
    ),
    meanWidth: mean(trialsData.map((r) => r.width)),
    targetInside: trialsData.filter((r) => r.low <= design.rate && design.rate <= r.high).length,
    searchBoundaryFits: trialsData.filter((r) => r.rate === 0 || r.rate === 8).length,
    meanResidualRMSE: mean(trialsData.map((r) => r.rmse)),
  }
}

function benchmark(cases: Case[], firstSeed: number) {
  return cases.map(({ name, settings }, index) => {
    const design = { ...defaultDesign, ...settings }
    const start = firstSeed + index * 1000
    const baseline = assess(design, start)
    const plan = recommend(design)
    const interventionsScored = interventions(design).map(({ id, design: proposal }) => ({
      id,
      ...assess(proposal, start),
      expectedReduction: plan.strategies.find((s) => s.id === id)!.reduction,
    }))
    const recommendation = plan.strategies[0].id
    const chosen = interventionsScored.find((r) => r.id === recommendation)!
    const best = interventionsScored.reduce((a, b) => (b.meanWidth < a.meanWidth ? b : a))
    return {
      name,
      design,
      firstSeed: start,
      trials,
      baseline,
      expectedBaselineWidth: plan.width,
      recommendation,
      smallestObservedMeanWidth: best.id,
      actualReduction: baseline.meanWidth - chosen.meanWidth,
      excessWidthOverBest: chosen.meanWidth - best.meanWidth,
      chosen,
      alternatives: interventionsScored,
    }
  })
}

const dev = benchmark(development, 1000)
const evalRows = benchmark(evaluation, 100000)
function summary(rows: typeof dev) {
  return {
    cases: rows.length,
    trialsPerCase: trials,
    observations: rows.length * trials,
    recommendedSmallestWidth: rows.filter((r) => r.recommendation === r.smallestObservedMeanWidth)
      .length,
    improvedMeanWidth: rows.filter((r) => r.actualReduction > 0).length,
    improvedMeanRateMAE: rows.filter((r) => r.chosen.rateMAE < r.baseline.rateMAE).length,
    meanBaselineRateMAE: mean(rows.map((r) => r.baseline.rateMAE)),
    meanChosenRateMAE: mean(rows.map((r) => r.chosen.rateMAE)),
    meanBaselineWidth: mean(rows.map((r) => r.baseline.meanWidth)),
    meanChosenWidth: mean(rows.map((r) => r.chosen.meanWidth)),
    meanBaselineSourceMAE: mean(rows.map((r) => r.baseline.sourceMAE)),
    baselineInside: rows.reduce((n, r) => n + r.baseline.targetInside, 0),
    chosenInside: rows.reduce((n, r) => n + r.chosen.targetInside, 0),
  }
}
const report = {
  protocol:
    'Single-room constant-rate constant-source synthetic experiments, paired noise draws across options.',
  development: { summary: summary(dev), cases: dev },
  evaluation: { summary: summary(evalRows), cases: evalRows },
}
writeFileSync(
  new URL('../../reports/phase2-synthetic.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(
  JSON.stringify(
    { development: report.development.summary, evaluation: report.evaluation.summary },
    null,
    2,
  ),
)
