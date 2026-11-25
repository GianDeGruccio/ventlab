import type { OptionId,PlanningInput } from './robust'

export function repeatEligibility(input:PlanningInput,action:OptionId,minutes:number) {
  const count=action==='empty'?0:input.occupancy
  const eligible=count===0 && minutes>=10
  return {
    model:'Prospective constant-rate, constant-source profile. The score optimizes modeled compatible-rate width across the ensemble.',
    eligibleByDesign:eligible,
    empirical:count>0 ? 'The planned repeat is occupied. The retrospective decay estimator abstains because generation is unknown.' :
      minutes<10 ? 'The repeat is shorter than the ten-minute minimum for retrospective decay inference.' :
      'The planned empty window meets the occupancy and duration requirements. Actual measurements and diagnostics still determine whether a decay estimate is available.',
    operatingCondition:action==='empty' ? 'Maintain the same ventilation operating condition when the room empties. An occupancy-responsive fan can change the rate, so the repeat would estimate a different target.' :
      'The design assumes fixed ventilation throughout the repeat and the same operating condition for comparisons.',
    evidence:'A projected width improvement does not establish improved empirical accuracy.',
  }
}
