"use client";
import { readData, clearDataCache } from "@/lib/client-cache";
import Image from "next/image";
import { useState,useEffect,useCallback,useRef } from "react";
import { Check,Flag,ArrowRight,ChevronLeft,ChevronRight,Plus,Undo2,LoaderCircle,Search,ChevronDown } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { usePrivateAmounts } from "./amount-privacy";
import CustomSelect,{SelectOption} from './select';
type Suggestion=Transaction & {id:string;category:string;probability:number;status:string;reason:string;merchant:string;amount_cents:number};
type Status={connected:boolean;pending:number;processing:number;examples:number;suggestions:Suggestion[]};
export default function SortBoard({rows,categories,busy,assign,addCategory,entity,onRefresh}: {
 rows:Transaction[];categories:{id:string;name:string}[];busy:boolean;
 assign:(category:string,transaction:Transaction)=>Promise<boolean>;
 addCategory:(name:string)=>Promise<unknown>;entity:string;onRefresh:()=>Promise<unknown>;
}) {
 const { money, spoken, hidden } = usePrivateAmounts();
 const [status,setStatus]=useState<Status|null>(null),[running,setRunning]=useState(false),[error,setError]=useState('');
 const [paused,setPaused]=useState(false),[retry,setRetry]=useState(0);
 const [tab,setTab]=useState<'review'|'auto'>('auto'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[expanded,setExpanded]=useState<string|null>(null),[chosen,setChosen]=useState('');
 const [adding,setAdding]=useState(false),[name,setName]=useState('');
 const refreshParent=useRef(onRefresh);
 useEffect(()=>{refreshParent.current=onRefresh;},[onRefresh]);
 const refreshStatus=useCallback(async()=>{setStatus(await readData<Status>('/api/data?action=ai-sort&entity='+encodeURIComponent(entity)));},[entity]);
 useEffect(()=>{
  let cancelled=false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function cycle(){
   try {
    clearDataCache();
    const snapshot=await readData<Status>('/api/data?action=ai-sort&entity='+encodeURIComponent(entity));
    if(cancelled)return;
    setStatus(snapshot);
    if(!paused && snapshot.connected && snapshot.pending>0){
     setRunning(true);
     const response=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ai-sort',entity})});
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||'Could not finish sorting.');
     if(cancelled)return;
     clearDataCache();
     await refreshStatus();
     await refreshParent.current();
    } else if(snapshot.processing===0) {
     await refreshParent.current();
    }
    if(!cancelled){setRunning(false);timer=setTimeout(()=>void cycle(),5000);}
   } catch(e){if(!cancelled){setRunning(false);setError(e instanceof Error?e.message:'Sorting interrupted. Retry to continue.');}}
  }
  setError('');
  void cycle();
  return()=>{cancelled=true;if(timer)clearTimeout(timer);};
 },[entity,paused,retry,refreshStatus]);
 const categoryName=(id:string)=>id==='__transfer'?'Own-account transfer':id==='__debt'?'Debt movement':categories.find(c=>c.id===id)?.name||'Choose category';
 const suggestions=new Map((status?.suggestions||[]).map(s=>[s.id,s]));
 const auto=(status?.suggestions||[]).filter(s=>s.status==='auto');
 const filtered=(tab==='review'?rows:auto).filter(t=>t.merchant.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/8)),currentPage=Math.min(page,pages-1),shown=filtered.slice(currentPage*8,currentPage*8+8);
 async function post(action:string,body:Record<string,unknown>={}){const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})});const b=await r.json();if(!r.ok)throw new Error(b.error);clearDataCache();return b;}
 async function accept(row:Transaction,category:string){if(!category||category==='unsorted')return;if(await assign(category,row)){setExpanded(null);setChosen('');await refreshStatus();}}
 return <section className="smart-sort" aria-label="Intelligent transaction sorting">
  <div className="smart-sort-top">
   <div className="smart-sort-intro"><span className="smart-sort-label">JEV AUTO-SORT</span><span className="smart-sort-state" role="status">{paused?'Paused on this screen':running||!!status?.processing?'Sorting automatically':!status?'Connecting…':!status.connected?'Not connected':status.pending?`${status.pending} queued`:'All queued transactions sorted'}</span></div>
   <button className="jev-sort-button" onClick={()=>setPaused(!paused)} disabled={busy||!status?.connected} aria-label={paused?'Resume Jev':'Pause screen sorting'}><Image src="/app-mark.svg" alt="" width={24} height={24}/><span>{paused?'Resume Jev':'Jev'}</span>{running?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}</button>
  </div>
  {error&&<div className="error" role="alert">{error} <button className="text-button" onClick={()=>{setPaused(false);setRetry(n=>n+1);}}>Retry sorting</button></div>}
  <div className="smart-review-table" aria-busy={running}>
   <div className="smart-toolbar"><div className="smart-tabs" role="group" aria-label="Sorting view"><button aria-pressed={tab==='review'} onClick={()=>{setTab('review');setPage(0);setExpanded(null);}}><Flag size={14}/>Pending / held <span>{rows.length}</span></button><button aria-pressed={tab==='auto'} onClick={()=>{setTab('auto');setPage(0);setExpanded(null);}}><Check size={14}/>Auto-sorted <span>{auto.length}</span></button></div><label className="smart-search"><Search size={15}/><input aria-label="Search sorting queue" placeholder="Find a merchant" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><button className="icon secondary" aria-label="Add category" onClick={()=>setAdding(!adding)}><Plus size={16}/></button></div>
   {adding&&<form className="smart-add" onSubmit={async e=>{e.preventDefault();try{await addCategory(name.trim());setName('');setAdding(false);}catch{setError('Could not add that category. Try another name.');}}}><input aria-label="New category name" placeholder="Category name" value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()}>Add category</button></form>}
   <div className="smart-columns" aria-hidden="true"><span>TRANSACTION</span><span>AMOUNT</span><span>CATEGORY</span><span>REVIEW</span></div>
   {shown.map(item=>{const s=suggestions.get(item.id);const row=rows.find(t=>t.id===item.id)??s;const suggestion=s&&s.category!=='unsorted'?s.category:'';return <div className="smart-record" key={item.id}>
    <div className="smart-row"><button className="smart-merchant" aria-expanded={expanded===item.id} onClick={()=>{setExpanded(expanded===item.id?null:item.id);setChosen(suggestion);}}><span className="merchant-letter">{item.merchant.charAt(0)}</span><span><strong>{item.merchant}</strong><small>{row?`${new Date(row.date+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})} · ${row.account}`:s?.reason}</small></span></button><b className="smart-amount" aria-label={spoken(item.amount_cents)}><span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(item.amount_cents)}</span></b><span className="smart-suggestion">{suggestion?<><span>{categoryName(suggestion)}</span><small>{s?.reason.includes('saved sorting rule')?'Your rule':s?.reason.includes('confirmed decision')?'Your confirmed decision':`${Math.round((s?.probability||0)*100)}% model score`}</small></>:<span className="muted">{s?'Needs context':'Not checked yet'}</span>}</span><div className="smart-row-actions">{tab==='auto'?<><button className="secondary" disabled={busy||running} onClick={async()=>{try{await post('ai-undo',{id:item.id});await onRefresh();await refreshStatus();}catch(e){setError(e instanceof Error?e.message:'Could not undo.');}}}><Undo2 size={14}/>Undo</button><button className="icon secondary" aria-label={`Correct ${item.merchant}`} onClick={()=>{setExpanded(expanded===item.id?null:item.id);setChosen(suggestion);}}><ChevronDown size={16}/></button></>:<><button className="secondary" disabled={busy||running||!suggestion||!row} onClick={()=>row&&accept(row,suggestion)}><Check size={14}/>Approve</button><button className="icon secondary" aria-label={`Review ${item.merchant}`} aria-expanded={expanded===item.id} onClick={()=>{setExpanded(expanded===item.id?null:item.id);setChosen(suggestion);}}><ChevronDown size={16}/></button></>}</div></div>
    {expanded===item.id&&<div className="smart-expanded"><div><p>{s?.reason||'Jev will sort queued transactions automatically. An undone decision stays held until you choose a category.'}</p>{row&&<small>{row.raw_description}</small>}</div>{row&&<div className="smart-correct"><CustomSelect aria-label="Correct category" value={chosen} onChange={e=>setChosen(e.target.value)}><SelectOption value="">Choose category</SelectOption>{categories.filter(c=>c.id!=='unsorted').map(c=><SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}<SelectOption value="__transfer">Own-account transfer</SelectOption><SelectOption value="__debt">Debt movement</SelectOption></CustomSelect><button disabled={busy||!chosen} onClick={()=>accept(row,chosen)}>Save <ArrowRight size={14}/></button></div>}</div>}
   </div>;})}
   {!shown.length&&<div className="smart-empty"><Check size={24}/><h3>{search?'No matching transactions.':tab==='auto'?'No automatic decisions yet.':'All sorted.'}</h3><p>{tab==='auto'?'Jev processes queued transactions automatically.':'New lines will appear here after a bank sync.'}</p></div>}
   <footer className="smart-pagination"><span>{filtered.length?`${currentPage*8+1}–${Math.min((currentPage+1)*8,filtered.length)} of ${filtered.length}`:'0 lines'}</span><div><button className="icon secondary" aria-label="Previous page" disabled={!currentPage} onClick={()=>{setPage(currentPage-1);setExpanded(null);}}><ChevronLeft size={16}/></button><button className="icon secondary" aria-label="Next page" disabled={currentPage>=pages-1} onClick={()=>{setPage(currentPage+1);setExpanded(null);}}><ChevronRight size={16}/></button></div></footer>
  </div>
 </section>;
}
