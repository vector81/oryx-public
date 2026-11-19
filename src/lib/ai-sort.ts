import "server-only";
import {randomUUID} from 'node:crypto';
import {query,run,batch} from './db';
import {predictCategories} from './jev';
import {exampleOf,rememberedCategory} from './sort-memory';
import {automaticCategory,automaticChanges,JEV_POLICY_VERSION} from './jev-policy';
import type {Transaction,Category,Rule} from './types';
import {classify} from './classify';
export async function ensureAiSort(){
  await run(`CREATE TABLE IF NOT EXISTS ai_sort (transaction_id TEXT PRIMARY KEY REFERENCES transactions(id),category_id TEXT,probability REAL NOT NULL DEFAULT 0,clarity REAL NOT NULL DEFAULT 0,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',model TEXT NOT NULL DEFAULT '',policy TEXT NOT NULL,run_id TEXT NOT NULL,previous_category TEXT,previous_reviewed INTEGER,created_at INTEGER NOT NULL)`);
  const columns=await query<{name:string}>('PRAGMA table_info(ai_sort)');
  if(!columns.some(c=>c.name==='previous_kind')){
    try{await run('ALTER TABLE ai_sort ADD COLUMN previous_kind TEXT');}
    catch(error){if(!(await query<{name:string}>('PRAGMA table_info(ai_sort)')).some(c=>c.name==='previous_kind'))throw error;}
  }
}
// All writes are conditional on the claimed snapshot. A human edit wins even if
// the model response arrives after it, and simultacreditus workers cannot apply twice.
export async function trainingExamples(exclude: string[] = []) {
  const rows = await query<Transaction>(`SELECT t.*,a.entity FROM transactions t
    JOIN accounts a ON a.id=t.account_id LEFT JOIN ai_sort s ON s.transaction_id=t.id
    WHERE t.reviewed=1 AND (t.category_id!='unsorted' OR t.kind IN ('transfer','debt'))
    AND (s.transaction_id IS NULL OR s.status='confirmed')
    ORDER BY COALESCE(s.created_at,0) DESC,t.date DESC`);
  return rows.filter(row => !exclude.includes(row.id)).map(exampleOf);
}

const ELIGIBLE = `(t.reviewed=0 OR t.category_id='unsorted') AND t.kind NOT IN ('transfer','debt')
  AND (s.transaction_id IS NULL OR s.status='review' OR (s.status='processing' AND s.created_at<?))`;

export async function aiSortStatus(entity: string) {
  await ensureAiSort();
  const suggestions = await query(`SELECT t.*,a.name account,s.category_id category,s.probability,s.clarity,s.status,s.reason
    FROM ai_sort s JOIN transactions t ON t.id=s.transaction_id JOIN accounts a ON a.id=t.account_id
    WHERE (?='all' OR a.entity=?) AND s.status!='processing' ORDER BY s.created_at DESC`, [entity,entity]);
  const pending = await query<{n:number}>(`SELECT count(*) n FROM transactions t JOIN accounts a ON a.id=t.account_id
    LEFT JOIN ai_sort s ON s.transaction_id=t.id WHERE (?='all' OR a.entity=?) AND ${ELIGIBLE}`, [entity,entity,Date.now()-180000]);
  const processing = await query<{n:number}>(`SELECT count(*) n FROM ai_sort s JOIN transactions t ON t.id=s.transaction_id
    JOIN accounts a ON a.id=t.account_id WHERE (?='all' OR a.entity=?) AND s.status='processing' AND s.created_at>=?`, [entity,entity,Date.now()-180000]);
  return {connected:!!process.env.TYPESAFE_API_KEY,pending:pending[0].n,processing:processing[0].n,examples:(await trainingExamples()).length,suggestions};
}

export async function runAiSort(entity: string) {
  await ensureAiSort();
  const stale = Date.now()-180000;
  const rows = await query<Transaction & {account_type:string}>(`SELECT t.*,a.entity,a.type account_type FROM transactions t
    JOIN accounts a ON a.id=t.account_id LEFT JOIN ai_sort s ON s.transaction_id=t.id
    WHERE (?='all' OR a.entity=?) AND ${ELIGIBLE} ORDER BY t.date DESC,t.id LIMIT 12`, [entity,entity,stale]);
  if (!rows.length) return {processed:0,automatic:0,review:0};
  const runId = randomUUID();
  await batch(rows.map(t => ({
    sql: `INSERT INTO ai_sort(transaction_id,status,policy,run_id,previous_category,previous_reviewed,previous_kind,created_at)
      SELECT ?,'processing',?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM transactions WHERE id=? AND category_id IS ? AND reviewed=? AND kind=?)
      ON CONFLICT(transaction_id) DO UPDATE SET status='processing',policy=excluded.policy,run_id=excluded.run_id,
      previous_category=excluded.previous_category,previous_reviewed=excluded.previous_reviewed,previous_kind=excluded.previous_kind,created_at=excluded.created_at
      WHERE ai_sort.status='review' OR (ai_sort.status='processing' AND ai_sort.created_at<?)`,
    params:[t.id,JEV_POLICY_VERSION,runId,t.category_id,t.reviewed,t.kind,Date.now(),t.id,t.category_id,t.reviewed,t.kind,stale],
  })));
  const claims = await query<{transaction_id:string}>("SELECT transaction_id FROM ai_sort WHERE run_id=? AND status='processing'", [runId]);
  const claimed = rows.filter(t => claims.some(c => c.transaction_id===t.id));
  if (!claimed.length) return {processed:0,automatic:0,review:0};
  try {
    const categories = await query<Category>('SELECT * FROM categories');
    const valid = new Set([...categories.map(c => c.id),'__transfer','__debt']);
    const rules = await query<Rule>('SELECT * FROM rules ORDER BY created_at DESC');
    const history = await trainingExamples(claimed.map(t => t.id));
    type Decision = {row:Transaction;category:string;probability:number;clarity:number;model:string;reason:string};
    const decisions: Decision[] = [];
    const unknown: Transaction[] = [];
    for (const row of claimed) {
      const known = classify(row.raw_description,row.amount_cents,row.entity||'me',rules,row.account_type,row.account_id);
      const ruleCategory = known.kind==='transfer' ? '__transfer' : known.kind==='debt' ? '__debt' : known.category_id;
      const memory = rememberedCategory(row,history);
      const category = memory ??
        (known.reviewed && valid.has(ruleCategory) && ruleCategory!=='unsorted' ? ruleCategory : null);
      if (category && valid.has(category)) decisions.push({row,category,probability:1,clarity:1,model:'oryx-rules',reason:category===ruleCategory && known.reviewed ? 'Matches your saved sorting rule or explicit policy.' : 'Matches your confirmed decision for this account and transaction.'});
      else unknown.push(row);
    }
    if (unknown.length) {
      const predicted = await predictCategories(unknown,categories,history);
      for (const p of predicted.results) decisions.push({...p,model:predicted.model,reason:'Automatically categorised using your policy and relevant confirmed decisions.'});
    }
    let automatic = 0;
    for (const p of decisions) {
      if (!valid.has(p.category) || !automaticCategory(p.category,p.probability)) throw new Error('Jev returned an invalid category. The remaining lines will retry.');
      const target = automaticChanges(p.category,p.row.kind);
      const results = await batch([
        {sql:`UPDATE ai_sort SET category_id=?,probability=?,clarity=?,status='auto',reason=?,model=?
          WHERE transaction_id=? AND run_id=? AND status='processing' AND EXISTS
          (SELECT 1 FROM transactions WHERE id=? AND category_id IS ? AND reviewed=? AND kind=?)`,
          params:[p.category,p.probability,p.clarity,p.reason,p.model,p.row.id,runId,p.row.id,p.row.category_id,p.row.reviewed,p.row.kind]},
        {sql:`UPDATE transactions SET category_id=?,kind=?,reviewed=1 WHERE id=? AND category_id IS ? AND reviewed=? AND kind=?
          AND EXISTS (SELECT 1 FROM ai_sort WHERE transaction_id=? AND run_id=? AND status='auto')`,
          params:[target.category,target.kind,p.row.id,p.row.category_id,p.row.reviewed,p.row.kind,p.row.id,runId]},
      ]);
      automatic += results[1].meta.changes;
    }
    await run("DELETE FROM ai_sort WHERE run_id=? AND status='processing'", [runId]);
    return {processed:decisions.length,automatic,review:0};
  } catch (error) {
    await run("DELETE FROM ai_sort WHERE run_id=? AND status='processing'", [runId]);
    throw error;
  }
}

// Compatibility endpoint: old clients must re-evaluate pending suggestions with
// current memory rather than applying a stale probability from an earlier run.
export const approveAiSuggestions = runAiSort;

/** Bounded server work. Remaining rows persist for the next poll or scheduled run. */
export async function drainAiSort(entity = 'all', budgetMs = 180000) {
  if (!process.env.TYPESAFE_API_KEY) return {processed:0,automatic:0};
  const deadline = Date.now()+budgetMs;
  let processed=0, automatic=0;
  while (Date.now()<deadline-65000) {
    const result = await runAiSort(entity);
    processed += result.processed; automatic += result.automatic;
    if (!result.processed) break;
  }
  return {processed,automatic};
}

export async function undoAiSort(id:string){
  await ensureAiSort();
  const result=await batch([
    {sql:`UPDATE transactions SET category_id=(SELECT previous_category FROM ai_sort WHERE transaction_id=?),reviewed=(SELECT previous_reviewed FROM ai_sort WHERE transaction_id=?),kind=COALESCE((SELECT previous_kind FROM ai_sort WHERE transaction_id=?),kind) WHERE id=? AND reviewed=1 AND category_id=(SELECT CASE category_id WHEN '__transfer' THEN 'unsorted' WHEN '__debt' THEN 'loan' ELSE category_id END FROM ai_sort WHERE transaction_id=? AND status='auto') AND kind=(SELECT CASE category_id WHEN '__transfer' THEN 'transfer' WHEN '__debt' THEN 'debt' ELSE previous_kind END FROM ai_sort WHERE transaction_id=? AND status='auto')`,params:[id,id,id,id,id,id]},
    {sql:"UPDATE ai_sort SET status='undone',reason='Returned for your review.' WHERE transaction_id=? AND status='auto'",params:[id]}
  ]);
  return {restored:result[0].meta.changes};
}
