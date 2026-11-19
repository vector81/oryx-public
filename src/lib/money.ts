import type { Transaction } from "./types";
export const money = (cents: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: currency === "AUD" ? "narrowSymbol" : "code",
  }).format(cents / 100);
export const spoken = (cents: number) =>
  `${cents < 0 ? "out" : "in"} ${Math.floor(Math.abs(cents) / 100)} dollars ${Math.abs(cents) % 100}`;
export function cents(value: string) {
  const s = value.replace(/[$,\s]/g, "");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Invalid amount. Use dollars and cents.");
  const [whole, part = ""] = s.replace(/^[+-]/, "").split(".");
  const n = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Amount is too large.");
  return s.startsWith("-") ? -n : n;
}
export function summary(
  rows: Pick<
    Transaction,
    "amount_cents" | "kind" | "reimbursable" | "reimbursed"
  >[],
) {
  let incoming = 0,
    out = 0,
    work = 0;
  for (const t of rows) {
    if (t.kind === "transfer" || t.kind === "debt") continue;
    if (t.amount_cents > 0) incoming += t.amount_cents;
    else if (t.reimbursable) {
      if (!t.reimbursed) {
        work -= t.amount_cents;
        out -= t.amount_cents;
      }
    } else out -= t.amount_cents;
  }
  return { in: incoming, out, kept: incoming - out, work };
}
export function rawTotals(rows: { amount_cents: number }[]) {
  return rows.reduce(
    (a, t) => ({
      in: a.in + Math.max(t.amount_cents, 0),
      out: a.out + Math.max(-t.amount_cents, 0),
    }),
    { in: 0, out: 0 },
  );
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function shiftMonth(month: string, n: number) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
export function monthBounds(month: string) {
  return [month + "-01", shiftMonth(month, 1) + "-01"];
}
