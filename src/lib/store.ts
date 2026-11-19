import { db as orm } from "./orm";
import { categories as categoryTable } from "./schema";
import { randomUUID, createHash } from "node:crypto";
import { query, run, batch, type Statement } from "./db";
import { classify, matchesRule } from "./classify";
import { sourceHash, type ImportRow } from "./importers";
import { monthBounds, summary, shiftMonth, today, money } from "./money";
import type { Account, Transaction, Rule, Debt } from "./types";
export async function accounts() {
  return query<Account>("SELECT * FROM accounts ORDER BY entity,name");
}
export async function transactions(filters: Record<string, unknown> = {}) {
  const clauses = ["1=1"];
  const p: unknown[] = [];
  for (const [k, col] of Object.entries({
    account: "t.account_id",
    category: "t.category_id",
    person: "t.person_id",
    trip: "t.trip_id",
    kind: "t.kind",
  })) {
    if (filters[k]) {
      clauses.push(`${col}=?`);
      p.push(filters[k]);
    }
  }
  if (filters.entity && filters.entity !== "all") {
    clauses.push("a.entity=?");
    p.push(filters.entity);
  }
  if (filters.month) {
    const [a, b] = monthBounds(String(filters.month));
    clauses.push("t.date>=? AND t.date<?");
    p.push(a, b);
  }
  if (filters.from) {
    clauses.push("t.date>=?");
    p.push(filters.from);
  }
  if (filters.to) {
    clauses.push("t.date<=?");
    p.push(filters.to);
  }
  if (filters.query) {
    clauses.push(
      "(t.merchant LIKE ? OR t.raw_description LIKE ? OR t.note LIKE ?)",
    );
    p.push(...Array(3).fill(`%${String(filters.query).slice(0, 200)}%`));
  }
  if (filters.unsorted) {
    clauses.push(
      "(t.reviewed=0 OR t.category_id='unsorted') AND t.kind!='transfer'",
    );
  }
  if (filters.reimbursable) clauses.push("t.reimbursable=1");
  if (filters.direction === "in")
    clauses.push("t.amount_cents>0 AND t.kind NOT IN ('transfer','debt')");
  if (filters.direction === "out")
    clauses.push("t.amount_cents<0 AND t.kind NOT IN ('transfer','debt')");
  const limit = Math.min(Number(filters.limit) || 200, 10000),
    page = Math.max(Number(filters.page) || 1, 1);
  p.push(limit, (page - 1) * limit);
  return query<Transaction>(
    `SELECT t.*,a.name account,a.entity,c.name category FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE ${clauses.join(" AND ")} ORDER BY t.date DESC,t.created_at DESC LIMIT ? OFFSET ?`,
    p,
  );
}
export async function dashboard(month: string, entity: string) {
  const [start, end] = monthBounds(month);
  const since = shiftMonth(month, -3) + "-01";
  const [
    rows,
    accts,
    categories,
    debts,
    people,
    trips,
    unsorted,
    imports,
    payments,
    rules,
  ] = await Promise.all([
    query<Transaction>(
      "SELECT t.*,a.name account,a.entity,c.name category FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE t.date>=? AND t.date<? AND (?='all' OR a.entity=?) ORDER BY t.date DESC",
      [since, end, entity, entity],
    ),
    accounts(),
    orm.select().from(categoryTable),
    query<Debt>("SELECT * FROM debts"),
    query<{ id: string; name: string }>("SELECT * FROM people"),
    query<{ id: string; name: string; start_date: string; end_date: string }>(
      "SELECT * FROM trips",
    ),
    query<{ count: number }>(
      "SELECT COUNT(*) count FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE (t.reviewed=0 OR t.category_id='unsorted') AND t.kind!='transfer' AND (?='all' OR a.entity=?)",
      [entity, entity],
    ),
    query("SELECT * FROM imports ORDER BY created_at DESC LIMIT 15"),
    query<{ debt_id: string; amount_cents: number; date: string }>(
      "SELECT * FROM debt_payments ORDER BY date",
    ),
    query<Rule>("SELECT * FROM rules ORDER BY created_at,id"),
  ]);
  const current = rows.filter((t) => t.date >= start);
  const previous = rows.filter((t) => t.date.startsWith(shiftMonth(month, -1)));
  const totals = summary(current.filter((t) => t.currency === "AUD"));
  const previousTotals = summary(previous.filter((t) => t.currency === "AUD"));
  const leaks = categories
    .map((c) => {
      const spend = (ts: Transaction[]) =>
        ts
          .filter(
            (t) =>
              t.category_id === c.id &&
              t.amount_cents < 0 &&
              t.kind === "spend" &&
              !t.reimbursable &&
              t.currency === "AUD",
          )
          .reduce((s, t) => s - t.amount_cents, 0);
      return {
        ...c,
        amount: spend(current),
        average: Math.round(spend(rows.filter((t) => t.date < start)) / 3),
      };
    })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const days = Array.from(
    {
      length: new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5)),
        0,
      ).getDate(),
    },
    (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      return {
        date,
        ...summary(
          current.filter((t) => t.date === date && t.currency === "AUD"),
        ),
      };
    },
  );
  const now = today(),
    date = new Date(now + "T12:00:00Z");
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  const monday = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() - 28);
  const fourAgo = date.toISOString().slice(0, 10);
  const weekRows = await query<Transaction>(
    "SELECT t.* FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.date>=? AND t.date<=? AND (?='all' OR a.entity=?)",
    [fourAgo, now, entity, entity],
  );
  return {
    month,
    entity,
    totals,
    previousTotals,
    days,
    leaks,
    latest: current.slice(0, 10),
    accounts: accts,
    categories,
    debts: debts.filter((d) => entity === "all" || d.entity === entity),
    people,
    trips,
    unsorted: unsorted[0].count,
    imports,
    payments,
    rules,
    week: {
      current: summary(
        weekRows.filter((t) => t.date >= monday && t.currency === "AUD"),
      ).out,
      average: Math.round(
        summary(weekRows.filter((t) => t.date < monday && t.currency === "AUD"))
          .out / 4,
      ),
    },
    foreignCount: current.filter((t) => t.currency !== "AUD").length,
  };
}
export async function ingest(
  account: string,
  rows: ImportRow[],
  filename: string,
  source = "csv",
  providerIds?: string[],
  currencies?: string[],
) {
  const [acct] = await query<Account>("SELECT * FROM accounts WHERE id=?", [
    account,
  ]);
  if (!acct) throw new Error("Choose an account before importing.");
  if (rows.length) {
    const dates = rows.map((r) => r.date).sort();
    const [overlap] = await query<{ count: number }>(
      "SELECT COUNT(*) count FROM transactions WHERE account_id=? AND source!=? AND date BETWEEN ? AND ?",
      [account, source, dates[0], dates[dates.length - 1]],
    );
    if (overlap.count)
      throw new Error(
        "These dates already contain another import source. Choose dates outside that range so purchases are not counted twice.",
      );
  }
  const rules = await query<Rule>("SELECT * FROM rules ORDER BY created_at,id");
  let added = 0;
  for (let offset = 0; offset < rows.length; offset += 80) {
    const statements: Statement[] = rows
      .slice(offset, offset + 80)
      .map((r, j) => {
        const i = offset + j;
        const cl = classify(
          r.raw_description,
          r.amount_cents,
          acct.entity,
          rules,
          acct.type,
          acct.id,
        );
        return {
          sql: "INSERT OR IGNORE INTO transactions(id,account_id,date,amount_cents,raw_description,merchant,category_id,person_id,kind,reviewed,source,source_hash,provider_id,running_balance_cents,currency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          params: [
            randomUUID(),
            account,
            r.date,
            r.amount_cents,
            r.raw_description,
            cl.merchant,
            cl.category_id,
            cl.person_id,
            cl.kind,
            cl.reviewed,
            source,
            providerIds?.[i]
              ? createHash("sha256")
                  .update(account + ":redbark:" + providerIds[i])
                  .digest("hex")
              : sourceHash(account, r),
            providerIds?.[i] || null,
            r.running_balance_cents,
            currencies?.[i] || "AUD",
          ],
        };
      });
    const results = await batch(statements);
    added += results.reduce((s, r) => s + r.meta.changes, 0);
  }
  const id = randomUUID();
  await run(
    "INSERT INTO imports(id,file_name,account_id,rows_in,rows_new,rows_skipped) VALUES(?,?,?,?,?,?)",
    [id, filename, account, rows.length, added, rows.length - added],
  );
  return {
    id,
    rows_in: rows.length,
    rows_new: added,
    rows_skipped: rows.length - added,
  };
}
export async function updateTransaction(
  id: string,
  changes: Record<string, unknown>,
) {
  changes = { ...changes };
  if (changes.reimbursed === true) changes.reimbursable = true;
  if (changes.reimbursable === false) changes.reimbursed = false;
  const allowed = [
    "category_id",
    "person_id",
    "trip_id",
    "note",
    "kind",
    "reimbursable",
    "reimbursed",
    "reviewed",
    "merchant",
  ];
  const entries = Object.entries(changes).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const edit = {
    sql: `UPDATE transactions SET ${entries.map(([k]) => `${k}=?`).join(",")} WHERE id=?`,
    params: [...entries.map(([, v]) => (typeof v === "boolean" ? Number(v) : v)), id],
  };
  if ('category_id' in changes || 'kind' in changes || changes.reviewed === 1) {
    const { ensureAiSort } = await import('./ai-sort');
    await ensureAiSort();
    await batch([edit, {
      sql: "UPDATE ai_sort SET status='confirmed',created_at=?,reason='Confirmed or corrected by you.' WHERE transaction_id=?",
      params: [Date.now(), id],
    }, {
      sql: "UPDATE ai_sort SET status='review',reason='Rechecking with your latest correction.' WHERE status='processing' AND transaction_id!=?",
      params: [id],
    }]);
  } else await batch([edit]);
}
export async function addRule(r: Omit<Rule, "id">) {
  const id = randomUUID();
  await run(
    "INSERT INTO rules(id,pattern,merchant,category_id,person_id,kind,entity) VALUES(?,?,?,?,?,?,?)",
    [id, r.pattern, r.merchant, r.category_id, r.person_id, r.kind, r.entity],
  );
  const rows = await query<Transaction>(
    "SELECT t.*,a.entity FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE (t.reviewed=0 OR t.category_id='unsorted') AND (? IS NULL OR a.entity=?)",
    [r.entity, r.entity],
  );
  let count = 0;
  for (const t of rows) {
    if (!matchesRule(t.raw_description, r.pattern, t.account_id)) continue;
    await updateTransaction(t.id, {
      ...classify(
        t.raw_description,
        t.amount_cents,
        t.entity || "me",
        [{ ...r, id }],
        undefined,
        t.account_id,
      ),
      reviewed: 1,
    });
    count++;
  }
  return { id, updated: count };
}
export function withFormatted<
  T extends { amount_cents: number; currency?: string },
>(t: T) {
  return { ...t, formatted: money(t.amount_cents, t.currency || "AUD") };
}
