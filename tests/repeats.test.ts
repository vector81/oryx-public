import { test } from "node:test";
import assert from "node:assert/strict";
import { repeatGroups } from "../src/lib/repeats";
import { classify } from "../src/lib/classify";
import type { Account, Transaction, Rule } from "../src/lib/types";
const account = {
  id: "credit",
  name: "Credit card",
  entity: "me",
  type: "card",
} as Account;
const row = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: "1",
    account_id: "credit",
    raw_description: "MONTHLY FEE",
    merchant: "MONTHLY FEE",
    amount_cents: -1200,
    category_id: "unsorted",
    reviewed: 0,
    kind: "spend",
    ...overrides,
  }) as Transaction;
test("monthly fees group with Bank fees suggestion, without changing rows", () => {
  const rows = [row(), row({ id: "2" })];
  const groups = repeatGroups(rows, [account], []);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].category, "bank-fees");
  assert.equal(groups[0].total, -2400);
  assert.equal(rows[0].reviewed, 0);
});
test("groups stay within accounts; ambiguous purchases and reviewed rows are not auto-labelled", () => {
  const groups = repeatGroups(
    [
      row({ raw_description: "SHOP 123" }),
      row({ id: "2", raw_description: "SHOP 123" }),
      row({ id: "3", account_id: "bank", raw_description: "SHOP 123" }),
      row({ id: "4", category_id: "shopping", reviewed: 1 }),
    ],
    [account],
    [],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].category, "");
});
test("remembered exact rules match the account and full description, preserving new transaction direction", () => {
  const rule = {
    id: "r",
    pattern: "exact:credit:monthly fee",
    category_id: "bank-fees",
    kind: null,
    merchant: "Monthly fee",
    person_id: null,
    entity: "me",
  } as Rule;
  assert.equal(
    classify("MONTHLY FEE", -1200, "me", [rule], "card", "credit").category_id,
    "bank-fees",
  );
  assert.equal(
    classify("MONTHLY FEE", -1200, "me", [rule], "card", "other").category_id,
    "unsorted",
  );
  assert.equal(
    classify("MONTHLY FEE REFUND", 1200, "me", [rule], "card", "credit")
      .category_id,
    "unsorted",
  );
  assert.equal(
    classify("MONTHLY FEE", 1200, "me", [rule], "card", "credit").kind,
    "income",
  );
});
test("existing transfer rows never enter repeated spending groups", () => {
  assert.deepEqual(
    repeatGroups(
      [row({ kind: "transfer" }), row({ id: "2", kind: "transfer" })],
      [account],
      [],
    ),
    [],
  );
});
