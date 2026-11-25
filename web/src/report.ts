import { repeatEligibility } from './repeat-eligibility'
import type { Design, experiment } from './design'
import type { PairedResult } from './comparison-model'
import type { ObservedWindow } from './recording-plan'
import type { PlanningInput, PlanningConstraints, RobustPlan, OptionId } from './robust'

type Run = ReturnType<typeof experiment>
export interface Decision {
  expectedInitialReadingPpm?: number
  mode: 'robust' | 'scenario'
  selected: OptionId
  recommended: string
  alternatives: RobustPlan['options'] | Run['strategies']
  constraints?: PlanningConstraints
  ensembleSize?: number
}
const methods = 'https://github.com/GianDeGruccio/ventlab/blob/main/docs/'
const provenance = {
  reportVersion: 2,
  model: 'Single well-mixed zone. dC/dt = k(B − C) + G with time in hours.',
  units:
    'Concentrations, offsets and sensor SD in ppm. Rates, widths, reductions and scores in h⁻¹. Generation in ppm/h, duration and planning interval in minutes.',
  citations: {
    recordingMethod: methods + 'science.md',
    profileFitter: methods + 'design-study.md',
    releaseCandidate: methods + 'phase6-review.md',
    robustPlanning: methods + 'robust-planning.md',
    stressEvidence: methods + 'stress-protocol.md',
  },
  limitations:
    'Narrow ranges can accompany larger errors. Changing sources or ventilation can invalidate a constant fit. Mechanical supply and effective room ventilation can differ. A proposed repeat has no observed outcome.',
}
const planningModel =
  'Equal-weight factorial ensemble: rates 0.35, 1.25, 2.7 and 5.5 h⁻¹; per-person generation 0, 450 and 900 ppm/h (zero in an empty room); supply 370, 430 and 490 ppm; room offsets −30, 0 and 30 ppm; duct offsets −8 and 8 ppm. Score averages mean and worst paired width reduction and subtracts an extra-time penalty.'
function plannedDecision(d: Decision) {
  return {
    ...d,
    operatingCondition:
      d.selected === 'empty'
        ? 'Emptying the room must preserve the ventilation operating condition to address the original rate. A responsive fan changes the target.'
        : 'The design assumes a fixed ventilation operating condition.',
    model:
      d.mode === 'robust'
        ? planningModel
        : 'Noise-free expected trace under the configured simulation parameters. Rank by projected compatible-width reduction.',
  }
}
export function recordingReport(
  w: ObservedWindow,
  planned?: { inputs: PlanningInput; decision: Decision },
) {
  return {
    ...provenance,
    kind: 'Measured recording · retrospective inference',
    source: {
      file: w.file,
      role: w.role,
      session: w.session,
      sessionRowsInclusive: [w.startRow, w.endRow],
      start: w.startStamp,
      end: w.endStamp,
      dataset:
        w.role === 'custom'
          ? 'Local user-supplied CSV; provenance supplied by the importer.'
          : 'Mikala, Xu & Huotari (2026), Indoor occupancy ground truth dataset with variable ventilation, v1.0, CC BY 4.0. https://doi.org/10.5281/zenodo.18299691',
    },
    measurements: {
      elapsedSeconds: w.input.timeS,
      roomPpm: w.input.room,
      occupancy: w.input.occupancy,
      supplyPpm: w.input.supply ?? null,
    },
    windowSummary: {
      initialPpm: w.initial,
      durationMinutes: w.duration,
      medianIntervalMinutes: w.interval,
      irregularCadence: w.irregular,
      constantValidOccupants: w.occupancy,
      validSupplySamples: w.supplyCount,
    },
    estimator: {
      assumptions:
        'Constant rate, zero generation for unoccupied decay; supplied CO₂ uses the left endpoint of each interval. If absent, background is assumed at 420 ppm. Rate search 0–30 h⁻¹.',
      results: w.result,
      rangeInterpretation:
        'Sensitivity endpoints across room and background perturbations. No calibrated coverage probability. Abstention leaves estimates unavailable. Missing rate-change checks indicate no assessment.',
    },
    proposedRepeat: planned
      ? {
          assumptions: planned.inputs,
          decision: plannedDecision(planned.decision),
          eligibility: repeatEligibility(
            planned.inputs,
            planned.decision.selected,
            planned.decision.alternatives.find((a) => a.id === planned.decision.selected)!.minutes,
          ),
          interpretation:
            'Planned inputs are user-confirmed expectations for the repeat. Sensor noise is a user assumption. Widths describe modeled scenarios. Future rate and accuracy are unknown.',
        }
      : null,
    afterMeasurement: null,
  }
}
function syntheticFit(d: Design, r: Run) {
  return {
    configuration: d,
    elapsedMinutes: r.minutes,
    roomObservationsPpm: r.observed,
    compatibleRegionsAch: r.compatibleRegions,
    nonUnique: r.nonUnique,
    fitRateAch: r.nonUnique ? null : r.fitRate,
    fitGenerationPpmPerHour: r.nonUnique ? null : r.fitGeneration,
    rmsePpm: r.rmse,
    compatibleRangeAch: [r.compatibleLow, r.compatibleHigh],
    widthAch: r.compatibleWidth,
    absoluteRateErrorAch: r.nonUnique ? null : Math.abs(d.rate - r.fitRate),
    absoluteSourceErrorPpmPerHour: r.nonUnique
      ? null
      : Math.abs(d.occupancy * d.generation - r.fitGeneration),
    diagnostics: {
      touchesSearchBoundary: r.compatibleLow === 0 || r.compatibleHigh === 8,
      occupiedUnknownSource: d.occupancy > 0,
    },
  }
}
export function simulationReport(d: Design, r: Run, decision: Decision, pair: PairedResult | null) {
  return {
    ...provenance,
    kind: 'Seeded synthetic experiment',
    source: 'VentLab single-zone simulator. The configured rate and source are synthetic truth.',
    estimator:
      'Continuously refined profile least squares on 0–8 h⁻¹. Compatible span uses SSE within 4 × max(noise SD, 1 ppm)² of the minimum; no calibrated coverage probability.',
    before: syntheticFit(d, r),
    plannedSelection: plannedDecision(decision),
    executedComparison: pair
      ? {
          strategy: pair.label,
          context:
            pair.origin === 'teaching'
              ? 'Fixed teaching intervention outside the constrained plan'
              : 'User-selected planned intervention',
          after: syntheticFit(pair.after, pair.second),
          widthChangeAch: pair.second.compatibleWidth - pair.first.compatibleWidth,
          absoluteErrorChangeAch:
            pair.first.nonUnique || pair.second.nonUnique
              ? null
              : Math.abs(pair.after.rate - pair.second.fitRate) -
                Math.abs(pair.before.rate - pair.first.fitRate),
        }
      : null,
  }
}
export function downloadReport(
  report: ReturnType<typeof recordingReport> | ReturnType<typeof simulationReport>,
) {
  const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = report.kind.startsWith('Measured')
    ? 'ventlab-recording-report.json'
    : 'ventlab-simulation-report.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
