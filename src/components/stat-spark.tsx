"use client";
import { useId, useState } from "react";
import { usePrivateAmounts } from "./amount-privacy";

export default function StatSpark({label,points}:{label:string;points:{label:string;value:number}[]}) {
 const { money, hidden } = usePrivateAmounts();
  const id=useId();
  const [index,setIndex]=useState<number|null>(null);
  const [pinned,setPinned]=useState(false);
  const max=Math.max(...points.map(p=>Math.abs(p.value)),1);
  const hasNegative=label === "Kept" && points.some(p=>p.value<0);
  const baseline=hasNegative?24:44;
  const range=hasNegative?20:38;
  const step=100/Math.max(points.length,1);
  const point=index===null?null:points[index];
  return <div className="stat-spark">
    <button className="stat-spark-trigger" aria-label={`${label} chart. ${points.length} bars. Use left and right arrows to inspect.`} aria-describedby={point?`${id}-tip`:undefined}
      onPointerDown={e=>{const box=e.currentTarget.getBoundingClientRect();setIndex(Math.min(points.length-1,Math.max(0,Math.floor((e.clientX-box.left)/box.width*points.length))));}}
      onPointerMove={e=>{if(!pinned){const box=e.currentTarget.getBoundingClientRect();setIndex(Math.min(points.length-1,Math.max(0,Math.floor((e.clientX-box.left)/box.width*points.length))));}}}
      onPointerLeave={()=>{if(!pinned)setIndex(null);}}
      onClick={()=>{setPinned(!pinned);if(index===null)setIndex(points.length-1);}}
      onFocus={()=>setIndex(points.length-1)} onBlur={()=>{setPinned(false);setIndex(null);}}
      onKeyDown={e=>{if(e.key==='Escape'){setIndex(null);setPinned(false);}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setIndex(n=>Math.max(0,Math.min(points.length-1,(n??0)+(e.key==='ArrowRight'?1:-1))));}}} disabled={!points.length}>
      <svg viewBox="0 0 100 48" aria-hidden="true">
        {hasNegative&&<line x1="0" y1={baseline} x2="100" y2={baseline} stroke="#bcc5ca" strokeWidth="0.5"/>}
        {points.map((p,i)=>{const height=Math.max(2,Math.abs(p.value)/max*range);return <rect key={i} x={i*step+1} y={hasNegative&&p.value<0?baseline:baseline-height} width={Math.max(2,step-3)} height={height} rx="1" fill={i===index?'#555555':'#111111'} stroke="none" strokeWidth={i===index?1:0.4}/>;})}
      </svg>
    </button>
    {point&&<div className="stat-spark-tip" id={`${id}-tip`} role="status"><span>{point.label}</span><strong>{label} {!hidden&&point.value>0?'+':''}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(point.value)}</span></strong></div>}
  </div>;
}
