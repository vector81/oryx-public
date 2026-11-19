import type { Rule, Transaction } from "./types";
export const normalisePattern = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function matchesRule(
  description: string,
  pattern: string,
  accountId?: string,
) {
  if (pattern.startsWith("exact:")) {
    const end = pattern.indexOf(":", 6);
    return (
      pattern.slice(6, end) === accountId &&
      normalisePattern(description) === pattern.slice(end + 1)
    );
  }
  return normalisePattern(description).includes(normalisePattern(pattern));
}
export function classify(
  description: string,
  amount: number,
  entity: string,
  rules: Rule[],
  accountType?: string,
  accountId?: string,
) {
  const d = description.toLowerCase();
  let value: {
    merchant: string;
    category_id: string;
    person_id: string | null;
    kind: Transaction["kind"];
    reviewed: number;
  } = {
    merchant: description
      .replace(
        /^(Fast Transfer (From|To)|Transfer (From|To)|Debit Purchase)\s+/i,
        "",
      )
      .slice(0, 90),
    category_id: "unsorted",
    person_id: null,
    kind: amount > 0 ? "income" : "spend",
    reviewed: 0,
  };
  if (/director.?s? loan|div.?7a/i.test(d))
    return {
      ...value,
      kind: "debt" as const,
      category_id: "loan",
      reviewed: 1,
    };
  if (
    (accountType === "card" && amount > 0 && /payment received/.test(d)) ||
    (accountType === "loan" && /repayment\/payment/.test(d))
  )
    return { ...value, kind: "transfer" as const, reviewed: 1 };
  for (const rule of [...rules].sort(
    (a, b) =>
      Number(b.pattern.startsWith("exact:")) -
      Number(a.pattern.startsWith("exact:")),
  )) {
    if (rule.entity && rule.entity !== entity) continue;
    if (matchesRule(d, rule.pattern, accountId)) {
      value = {
        ...value,
        merchant: rule.merchant || value.merchant,
        category_id: rule.category_id || value.category_id,
        person_id: rule.person_id || null,
        kind: rule.kind || value.kind,
        reviewed: 1,
      };
      break;
    }
  }
  return value;
}
