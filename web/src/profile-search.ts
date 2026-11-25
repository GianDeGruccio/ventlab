/** Discovery mesh brackets extrema. All refinements and crossings evaluate the actual loss. */
export const searchRates = Array.from({length:161}, (_, i) => i / 20)
type Point = {k:number; loss:number}
type Loss = (k:number)=>number

function extremum(evaluate:Loss, left:number, right:number, direction:number):Point {
  const f = (Math.sqrt(5)-1)/2
  let x=right-f*(right-left), y=left+f*(right-left)
  let a=evaluate(x), b=evaluate(y)
  while(right-left > 2e-9) {
    if(direction*a <= direction*b) {
      right=y; y=x; b=a; x=right-f*(right-left); a=evaluate(x)
    } else {
      left=x; x=y; a=b; y=left+f*(right-left); b=evaluate(y)
    }
  }
  return direction*a <= direction*b ? {k:x,loss:a} : {k:y,loss:b}
}
function discover(evaluate:Loss, maxima:boolean) {
  const points=searchRates.map(k=>({k,loss:evaluate(k)}))
  const extra:Point[]=[]
  for(let i=0;i<points.length;i++) {
    const left=points[Math.max(0,i-1)], mid=points[i], right=points[Math.min(i+1,points.length-1)]
    // Ignore roundoff on exact plateaus. Include endpoint brackets for off-grid extrema near a bound.
    const eps=1e-13*Math.max(1,Math.abs(mid.loss))
    for(const sign of maxima ? [1,-1] : [1]) {
      const a=sign*(left.loss-mid.loss), b=sign*(right.loss-mid.loss)
      if(a>=0 && b>=0 && (a>eps || b>eps)) extra.push(extremum(evaluate,left.k,right.k,sign))
    }
  }
  return [...points,...extra].sort((a,b)=>a.k-b.k)
}
export function continuousMinimum(evaluate:Loss) {
  return discover(evaluate,false).reduce((best,p)=>p.loss<best.loss?p:best)
}
export function continuousBand(evaluate:Loss, noise:number) {
  const points=discover(evaluate,true)
  const threshold=Math.min(...points.map(p=>p.loss))+4*Math.max(noise,1)**2
  const regions:[number,number][]=[]
  let start=points[0].loss<=threshold ? 0 : null
  for(let i=1;i<points.length;i++) {
    const previous=points[i-1], next=points[i], inside=previous.loss<=threshold
    if(inside===(next.loss<=threshold)) continue
    let lo=previous.k, hi=next.k
    while(hi-lo>1e-9) {
      const mid=(lo+hi)/2
      if((evaluate(mid)<=threshold)===inside) lo=mid
      else hi=mid
    }
    const edge=(lo+hi)/2
    if(inside) { regions.push([start!,edge]); start=null }
    else start=edge
  }
  if(start!==null) regions.push([start,8])
  const low=regions[0][0], high=regions[regions.length-1][1]
  return {low,high,width:high-low,regions}
}
