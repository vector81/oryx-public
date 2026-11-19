"use client";
import {useState} from 'react';
import { usePrivateAmounts } from "./amount-privacy";

type Day={date:string;in:number;out:number};
export default function SpendChart({days}:{days:Day[]}){
 const { money, hidden } = usePrivateAmounts();
 const [active,setActive]=useState<number|null>(null);
 const maximum=Math.max(...days.map(d=>d.out),10000);
 const unit=10**Math.floor(Math.log10(maximum/5));
 const step=Math.ceil(maximum/5/unit)*unit;
 const ceiling=step*5;
 const selected=active===null?null:days[active];
 const label=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
 return <div className="receipt-chart-scroll"><div className="receipt-chart">
  <div className="receipt-scale" aria-hidden="true">{Array.from({length:6},(_,i)=><span key={i} className={hidden ? "amount-skeleton" : undefined}>{hidden ? '••••' : new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format((ceiling-step*i)/100)}</span>)}</div>
  <div className="receipt-grid" style={{gridTemplateColumns:`repeat(${days.length},minmax(0,1fr))`}} role="group" aria-label="Daily spending in Australian dollars" onMouseLeave={()=>setActive(null)}>
   {days.map((day,i)=>{
    const filled=Math.round(day.out/ceiling*20);
    return <button key={day.date} className={`receipt-day ${active===i?'is-active':''}`} aria-label={`${label(day.date)}, out ${money(day.out)}, in ${money(day.in)}`} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onClick={()=>setActive(i)} onKeyDown={e=>{if(e.key==='Escape')setActive(null);}}>
     {Array.from({length:40},(_,cell)=><span key={cell} aria-hidden="true" className={19-Math.floor(cell/2)<filled?'ink-cell':''}/>)}
     {(i===0||(i+1)%5===0)&&<small className="receipt-date" aria-hidden="true">{i+1}</small>}
    </button>;
   })}
   {selected&&active!==null&&<div className={`receipt-tooltip ${active>days.length*.65?'anchor-right':''}`} style={{left:`${(active+.5)/days.length*100}%`}} role="status">
    <strong>{label(selected.date)}</strong><div><span>In</span><b>{!hidden && "+"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(selected.in)}</span></b></div><div><span>Out</span><b>{!hidden && "−"}<span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(selected.out)}</span></b></div>
   </div>}
  </div>
 </div></div>;
}
