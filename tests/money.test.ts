import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { bankCsv, sourceHash } from "../src/lib/importers";
import { cents, summary, rawTotals } from "../src/lib/money";
import { classify } from "../src/lib/classify";
test("Bank headerless CSV preserves signed cents, quoted commas and balances; reimport inserts zero", () => {
  const rows = bankCsv.parse(
    '14/01/2024,"-42.50","SHOP, EXAMPLE","+100.00"\n14/01/2024,"+500.00","PAY","+600.00"',
  );
  assert.equal(rows[0].amount_cents, -4250);
  assert.equal(rows[0].raw_description, "SHOP, EXAMPLE");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tx (source_hash TEXT UNIQUE, amount_cents INTEGER)");
  const insert = db.prepare("INSERT OR IGNORE INTO tx VALUES (?,?)");
  const load = () =>
    rows.reduce(
      (n, r) =>
        n +
        Number(insert.run(sourceHash("everyday", r), r.amount_cents).changes),
      0,
    );
  assert.equal(load(), 2);
  assert.equal(load(), 0);
  assert.notEqual(
    sourceHash("everyday", rows[0]),
    sourceHash("savings", rows[0]),
  );
  db.close();
});
test("same-day equal purchases with different running balances remain distinct", () => {
  const row = {
    date: "2024-01-14",
    amount_cents: -1000,
    raw_description: "SHOP",
    running_balance_cents: 2000,
  };
  assert.notEqual(
    sourceHash("a", row),
    sourceHash("a", { ...row, running_balance_cents: 1000 }),
  );
});
test("Card repayment is a transfer and not spending", () => {
  const c = classify("PAYMENT RECEIVED, THANK YOU", 25000, "me", [], "card");
  assert.equal(c.kind, "transfer");
  assert.deepEqual(
    summary([{ ...c, amount_cents: -25000, reimbursable: 0, reimbursed: 0 }]),
    { in: 0, out: 0, kept: 0, work: 0 },
  );
});
test("director loans excluded, reimbursable buys isolated, reimbursed buys removed", () => {
  const base = {
    kind: "spend" as const,
    amount_cents: -1000,
    reimbursable: 0,
    reimbursed: 0,
  };
  const rows = [
    base,
    { ...base, kind: "income" as const, amount_cents: 5000 },
    { ...base, kind: "debt" as const, amount_cents: 3000 },
    { ...base, reimbursable: 1 },
    { ...base, reimbursable: 1, reimbursed: 1 },
  ];
  assert.deepEqual(summary(rows), {
    in: 5000,
    out: 2000,
    kept: 3000,
    work: 1000,
  });
});
test("raw totals before classification and decimal parsing are exact", () => {
  assert.equal(cents("12,345.67"), 1234567);
  assert.equal(cents("-0.29"), -29);
  assert.deepEqual(
    rawTotals([
      { amount_cents: 100001 },
      { amount_cents: -4229 },
      { amount_cents: 29 },
    ]),
    { in: 100030, out: 4229 },
  );
  assert.throws(() => cents("1.005"));
});
test("invalid CSV fails without partial rows", () => {
  assert.throws(() => bankCsv.parse("31/02/2026,-1.00,SHOP,0.00"));
  assert.throws(() => bankCsv.parse("date,amount,description,balance"));
});

test("generic bank descriptions exclude both card repayment legs", () => {
  assert.equal(
    classify("PAYMENT RECEIVED, THANK YOU", 10000, "me", [], "card").kind,
    "transfer",
  );
  assert.equal(
    classify("PAYMENT RECEIVED, THANK YOU", 10000, "me", [], "bank").kind,
    "income",
  );
});
