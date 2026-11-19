import { classify, normalisePattern } from "./classify";
import type { Transaction, Account, Rule } from "./types";
export type RepeatGroup = {
  key: string;
  account: string;
  accountName: string;
  description: string;
  merchant: string;
  count: number;
  total: number;
  category: string;
  reason: string;
};
export function repeatGroups(
  rows: Transaction[],
  accounts: Account[],
  rules: Rule[],
): RepeatGroup[] {
  const groups = new Map<string, RepeatGroup>();
  for (const row of rows) {
    if (
      row.kind === "transfer" ||
      row.kind === "debt" ||
      (row.reviewed && row.category_id !== "unsorted")
    )
      continue;
    const description = normalisePattern(row.raw_description),
      key = row.account_id + "|" + description;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.total += row.amount_cents;
      continue;
    }
    const account = accounts.find((a) => a.id === row.account_id);
    const guess = classify(
      row.raw_description,
      row.amount_cents,
      account?.entity || "me",
      rules,
      account?.type,
      row.account_id,
    );
    let category =
      guess.kind === "transfer"
        ? "__transfer"
        : guess.reviewed && guess.category_id !== "unsorted"
          ? guess.category_id
          : "";
    let reason = category ? "Matches your rules" : "";
    if (
      !category &&
      account?.type === "card" &&
      /^monthly fee$/.test(description)
    ) {
      category = "bank-fees";
      reason = "Card monthly fee";
    }
    if (
      !category &&
      /^(apple com bill|xero au |xro xero |openai chatgpt|amaysim mobile)/.test(
        description,
      )
    ) {
      category = "subscriptions";
      reason = "Recurring service, check before applying";
    }
    groups.set(key, {
      key,
      account: row.account_id,
      accountName: account?.name || row.account || "",
      description,
      merchant: row.merchant,
      count: 1,
      total: row.amount_cents,
      category,
      reason,
    });
  }
  return [...groups.values()]
    .filter((g) => g.count > 1 || g.category)
    .sort((a, b) => b.count - a.count);
}
