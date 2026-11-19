import assert from 'node:assert/strict';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runAiSort,ensureAiSort,trainingExamples,undoAiSort,aiSortStatus,drainAiSort} from '../../src/lib/ai-sort';
import {updateTransaction} from '../../src/lib/store';

async function main() {
  const db=new DatabaseSync(':memory:');
  for (const name of ['0001.sql','0002_categories.sql','0003_bill_categories.sql','0004_jev_sort.sql']) {
    db.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
  }
  db.exec('DELETE FROM rules');
  let calls=0;
  let answer='food';
  let fail=false;
  let malformed=false;
  let duringModel:(()=>Promise<void>)|undefined;
  globalThis.fetch=async (url,options)=>{
    const body=JSON.parse(String(options?.body));
    if(String(url)==='https://db.test') {
      db.exec('BEGIN');
      try {
        const results=body.statements.map(({sql,params}:{sql:string;params:SQLInputValue[]})=>{
          const stmt=db.prepare(sql);
          if(stmt.columns().length) return {results:stmt.all(...params),meta:{changes:0}};
          return {results:[],meta:{changes:Number(stmt.run(...params).changes)}};
        });
        db.exec('COMMIT');return Response.json(results);
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
    assert.equal(String(url),'https://api.typesafe.ai/v1/systemone','No real network access allowed');
    calls++;
    if(fail)return new Response('Unavailable',{status:503});
    if(duringModel) {const effect=duringModel;duringModel=undefined;await effect();}
    const answers:Record<string,unknown>={};
    for(const name of Object.keys(body.questions)) {
      answers[name]=name.startsWith('category_')?{type:'choice',choice:answer,confidence:.1,probabilities:{[answer]:malformed?2:.4,[answer==='food'?'living':'food']:.3,travel:.3}}:{type:'noul',noul:.35};
    }
    return Response.json({model:'test-model',answers});
  };
  await ensureAiSort();
  function reset(){db.exec('DELETE FROM ai_sort; DELETE FROM transactions');calls=0;answer='food';fail=false;malformed=false;duringModel=undefined;}
  function add(id:string,description='Unknown merchant',category='unsorted',reviewed=0,kind='spend') {
    db.prepare(`INSERT INTO transactions(id,account_id,date,amount_cents,raw_description,merchant,category_id,kind,reviewed,source,source_hash)
      VALUES(?,'everyday','2024-01-15',-12345,?,?,?,?,?,'test',?)`).run(id,description,description,category,kind,reviewed,id);
  }
  const tx=(id:string)=>db.prepare('SELECT * FROM transactions WHERE id=?').get(id)!;
  const audit=(id:string)=>db.prepare('SELECT * FROM ai_sort WHERE transaction_id=?').get(id)!;

  reset();add('low');
  const original=tx('low');
  assert.equal((await runAiSort('all')).automatic,1);
  assert.equal(tx('low').category_id,'food');assert.equal(audit('low').probability,.4);
  for(const field of ['amount_cents','date','currency','raw_description','account_id','note','reimbursable','reimbursed']) assert.equal(tx('low')[field],original[field]);
  assert.equal((await trainingExamples()).length,0,'unconfirmed automatic output never trains itself');
  assert.equal((await undoAiSort('low')).restored,1);
  assert.equal(tx('low').category_id,'unsorted');assert.equal((await runAiSort('all')).processed,0,'Undo remains held');

  reset();add('old','Rent merchant','living',1);add('new','Rent merchant');
  assert.equal((await runAiSort('all')).automatic,1);assert.equal(calls,0,'exact memory avoids model');assert.equal(tx('new').category_id,'living');
  await updateTransaction('new',{category_id:'work',reviewed:1});
  assert.equal(audit('new').status,'confirmed');
  assert.equal((await trainingExamples()).some(e=>e.category==='work'),true);
  assert.equal((await undoAiSort('new')).restored,0,'Undo never overwrites a correction');

  reset();add('pending');
  db.prepare(`INSERT INTO ai_sort(transaction_id,category_id,probability,status,policy,run_id,previous_category,previous_reviewed,created_at)
    VALUES('pending','living',.2,'review','old','old','unsorted',0,0)`).run();
  assert.equal((await aiSortStatus('all')).pending,1);
  await runAiSort('all');assert.equal(calls,1);assert.equal(tx('pending').category_id,'food','old suggestions are re-evaluated');

  reset();add('race');duringModel=async()=>{await updateTransaction('race',{category_id:'living',reviewed:1});};
  assert.equal((await runAiSort('all')).automatic,0);assert.equal(tx('race').category_id,'living');assert.equal(audit('race').status,'confirmed');

  reset();add('corrected','Recurring merchant');add('sibling','Recurring merchant');
  duringModel=async()=>{await updateTransaction('corrected',{category_id:'living',reviewed:1});};
  assert.equal((await runAiSort('all')).automatic,0,'old in-flight decisions are invalidated after a correction');
  assert.equal((await runAiSort('all')).automatic,1);assert.equal(tx('sibling').category_id,'living');assert.equal(calls,1,'retry uses the new confirmed memory');

  reset();add('parallel');
  const parallel=await Promise.all([runAiSort('all'),runAiSort('all')]);
  assert.equal(parallel.reduce((n,r)=>n+r.automatic,0),1);assert.equal(calls,1);

  reset();add('retry');fail=true;
  await assert.rejects(runAiSort('all'));assert.equal(tx('retry').reviewed,0);assert.equal((await aiSortStatus('all')).pending,1);
  fail=false;assert.equal((await runAiSort('all')).automatic,1);

  reset();add('invalid');malformed=true;
  await assert.rejects(runAiSort('all'));assert.equal(tx('invalid').reviewed,0);assert.equal((await aiSortStatus('all')).pending,1);

  reset();add('movement');answer='__transfer';
  await runAiSort('all');assert.equal(tx('movement').kind,'transfer');assert.equal(tx('movement').category_id,'unsorted');
  assert.equal((await undoAiSort('movement')).restored,1);assert.equal(tx('movement').kind,'spend');

  reset();for(let i=0;i<25;i++)add('batch'+i,'Distinct merchant '+i);
  assert.equal((await drainAiSort('all')).automatic,25);assert.equal(calls,3);assert.equal((await aiSortStatus('all')).pending,0);
  db.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
