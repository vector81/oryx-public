import Papa from "papaparse";
import { createHash } from "node:crypto";
import { cents } from "./money";
export type ImportRow = {
  date: string;
  amount_cents: number;
  raw_description: string;
  running_balance_cents: number | null;
};
export interface Importer {
  parse(content: string): ImportRow[];
}
export function isoDate(s: string) {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("Date must use DD/MM/YYYY.");
  const v = `${m[3]}-${m[2]}-${m[1]}`;
  if (new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v)
    throw new Error("Invalid date in file.");
  return v;
}
export const bankCsv: Importer = {
  parse(content) {
    const parsed = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), {
      skipEmptyLines: "greedy",
    });
    if (parsed.errors.length)
      throw new Error(
        "Could not read this CSV. Export it again from Bank.",
      );
    return parsed.data.map((r, i) => {
      if (r.length !== 4)
        throw new Error(
          `Row ${i + 1}: expected date, amount, description and balance.`,
        );
      return {
        date: isoDate(r[0]),
        amount_cents: cents(r[1]),
        raw_description: r[2].trim(),
        running_balance_cents: r[3].trim() ? cents(r[3]) : null,
      };
    });
  },
};
export function sourceHash(account: string, row: ImportRow) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        account,
        row.date,
        row.amount_cents,
        row.raw_description,
        row.running_balance_cents,
      ]),
    )
    .digest("hex");
}
export function parseCardText(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const line of text.split("\n")) {
    const m = line
      .trim()
      .match(
        /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([+-]?\$?[\d,]+\.\d{2})(?:\s+(CR|DR))?$/i,
      );
    if (m) {
      const amount = cents(m[3]);
      rows.push({
        date: isoDate(m[1]),
        raw_description: m[2],
        amount_cents:
          m[4]?.toUpperCase() === "CR" ? Math.abs(amount) : -Math.abs(amount),
        running_balance_cents: null,
      });
    }
  }
  if (!rows.length)
    throw new Error(
      "No dated transactions found in this Credit PDF. Use a text PDF with DD/MM/YYYY transaction dates. Nothing was imported.",
    );
  return rows;
}
