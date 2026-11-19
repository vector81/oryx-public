import { randomUUID } from "node:crypto";
import { batch, query } from "./db";
import type { Debt } from "./types";

export async function logDebtPayment(
  debtId: string,
  amount: number,
  date: string,
) {
  const id = randomUUID();
  const results = await batch([
    {
      sql: "INSERT INTO debt_payments(id,debt_id,amount_cents,date) SELECT ?,id,?,? FROM debts WHERE id=? AND balance_cents>=?",
      params: [id, amount, date, debtId, amount],
    },
    {
      sql: "UPDATE debts SET balance_cents=balance_cents-? WHERE id=? AND EXISTS(SELECT 1 FROM debt_payments WHERE id=?)",
      params: [amount, debtId, id],
    },
  ]);
  if (!results[0].meta.changes)
    throw new Error("Payment must not exceed the recorded balance.");
  const [debt] = await query<Debt>("SELECT * FROM debts WHERE id=?", [debtId]);
  return debt;
}
