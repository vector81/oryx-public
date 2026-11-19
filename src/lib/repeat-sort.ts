import { randomUUID } from "node:crypto";
import { query, batch, type Statement } from "./db";
import { normalisePattern } from "./classify";
import type { Transaction } from "./types";
export async function applyRepeatSort(
  groups: { account: string; description: string; category: string }[],
  remember: boolean,
) {
  const { ensureAiSort } = await import('./ai-sort');
  await ensureAiSort();
  const rows = await query<Transaction>(
    "SELECT * FROM transactions WHERE (reviewed=0 OR category_id='unsorted') AND kind NOT IN ('transfer','debt')",
  );
  const categories = new Set(
    (await query<{ id: string }>("SELECT id FROM categories")).map((c) => c.id),
  );
  const accounts = await query<{ id: string; entity: string }>(
    "SELECT id,entity FROM accounts",
  );
  const edits: Statement[] = [];
  let count = 0;
  for (const group of groups) {
    if (
      group.category !== "__transfer" &&
      group.category !== "bank-fees" &&
      !categories.has(group.category)
    )
      throw new Error("Choose a valid category.");
    const account = accounts.find((a) => a.id === group.account);
    if (!account) throw new Error("Account not found.");
    const matching = rows.filter(
      (r) =>
        r.account_id === group.account &&
        normalisePattern(r.raw_description) === group.description,
    );
    if (!matching.length) continue;
    if (group.category === "bank-fees")
      edits.push({
        sql: "INSERT OR IGNORE INTO categories(id,name) VALUES('bank-fees','Bank fees')",
        params: [],
      });
    for (const row of matching) {
      edits.push({
        sql: "UPDATE transactions SET category_id=?,kind=?,reviewed=1 WHERE id=? AND (reviewed=0 OR category_id='unsorted') AND kind NOT IN ('transfer','debt')",
        params: [
          group.category === "__transfer" ? "unsorted" : group.category,
          group.category === "__transfer" ? "transfer" : row.kind,
          row.id,
        ],
      });
      count++;
      edits.push({
        sql: "UPDATE ai_sort SET status='confirmed',created_at=?,reason='Confirmed by you in repeated sorting.' WHERE transaction_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND reviewed=1 AND category_id=?)",
        params: [Date.now(), row.id, row.id, group.category === '__transfer' ? 'unsorted' : group.category],
      });
    }
    if (remember)
      edits.push({
        sql: "INSERT INTO rules(id,pattern,merchant,category_id,kind,entity) VALUES(?,?,?,?,?,?)",
        params: [
          randomUUID(),
          "exact:" + group.account + ":" + group.description,
          matching[0].merchant,
          group.category === "__transfer" ? "unsorted" : group.category,
          group.category === "__transfer" ? "transfer" : null,
          account.entity,
        ],
      });
  }
  for (let i = 0; i < edits.length; i += 80)
    await batch(edits.slice(i, i + 80));
  if (count) await batch([{sql:"UPDATE ai_sort SET status='review',reason='Rechecking with your latest corrections.' WHERE status='processing'",params:[]}]);
  return { updated: count };
}
