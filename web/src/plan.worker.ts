import { robustPlan, type PlanningInput, type PlanningConstraints } from './robust'
self.onmessage = (
  event: MessageEvent<{ inputs: PlanningInput; constraints: PlanningConstraints }>,
) => {
  try {
    self.postMessage({ plan: robustPlan(event.data.inputs, event.data.constraints) })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Planning calculation failed.',
    })
  }
}
