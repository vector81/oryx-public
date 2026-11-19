import { cleanBankText } from './jev-policy';
import { normalisePattern } from './classify';
import type { Transaction } from './types';

export type SortExample = {
  description: string; merchant: string; category: string; entity: string;
  account: string; currency: string; direction: string; amount_cents: number;
};
const key = (s: string) => normalisePattern(cleanBankText(s));
export function exampleOf(row: Transaction): SortExample {
  return {
    description: cleanBankText(row.raw_description), merchant: cleanBankText(row.merchant),
    category: row.kind === 'transfer' ? '__transfer' : row.kind === 'debt' ? '__debt' : row.category_id,
    entity: row.entity || 'me', account: row.account_id, currency: row.currency,
    direction: row.amount_cents < 0 ? 'out' : 'in', amount_cents: row.amount_cents,
  };
}
function sameContext(a: SortExample, b: SortExample) {
  return a.account === b.account && a.entity === b.entity && a.currency === b.currency && a.direction === b.direction;
}
function similarity(a: string, b: string) {
  const aa = new Set(key(a).split(' ').filter(x => x.length > 2));
  const bb = new Set(key(b).split(' ').filter(x => x.length > 2));
  return [...aa].filter(x => bb.has(x)).length / Math.max(aa.size, bb.size, 1);
}
/** Exact repeats can reuse a decision only when the matching history agrees. */
export function rememberedCategory(row: Transaction, history: SortExample[]): string | null {
  const target = exampleOf(row);
  const matches = history.filter(e => sameContext(e, target) && key(e.description) === key(target.description));
  const categories = new Set(matches.map(e => e.category));
  return categories.size === 1 ? matches[0].category : null;
}
/** Retrieve per transaction so unrelated recent categories cannot crowd out its merchant. */
export function relevantExamples(row: Transaction, history: SortExample[], limit = 8): SortExample[] {
  const target = exampleOf(row);
  const ranked = history.filter(e => e.entity === target.entity && e.currency === target.currency && e.direction === target.direction)
    .map((e, order) => ({ e, order, score:
      (key(e.description) === key(target.description) ? 100 : 0) +
      (key(e.merchant) === key(target.merchant) ? 40 : 0) +
      similarity(e.description, target.description) * 20 +
      (e.account === target.account ? 5 : 0) + (e.amount_cents === target.amount_cents ? 2 : 0),
    })).sort((a, b) => b.score - a.score || a.order - b.order);
  const seen = new Set<string>();
  return ranked.filter(({ e }) => {
    const k = `${e.account}|${key(e.description)}|${e.category}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, limit).map(({ e }) => e);
}
