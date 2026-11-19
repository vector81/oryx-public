"use client";
import { useState } from "react";
import { repeatGroups } from "@/lib/repeats";
import type { Transaction, Account, Category, Rule } from "@/lib/types";
import CustomSelect, { SelectOption } from "./select";
import { usePrivateAmounts } from "./amount-privacy";
type Props = {
  rows: Transaction[];
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
  apply: (body: Record<string, unknown>) => Promise<unknown>;
};
export default function RepeatSorter({
  rows,
  accounts,
  categories,
  rules,
  apply,
}: Props) {
 const { money, hidden } = usePrivateAmounts();
  const [open, setOpen] = useState(false),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const groups = repeatGroups(rows, accounts, rules);
  const selected = groups.filter((g) => (choices[g.key] ?? g.category) !== "");
  const count = selected.slice(0, 100).reduce((n, g) => n + g.count, 0);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = (await apply({
        groups: selected
          .slice(0, 100)
          .map((g) => ({
            account: g.account,
            description: g.description,
            category: choices[g.key] ?? g.category,
          })),
        remember,
      })) as { updated: number };
      setMessage(`${result.updated} lines sorted.`);
      setChoices({});
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not sort. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="repeat-sorter">
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open
          ? "Close auto-sort review"
          : `Auto-sort repeated lines (${groups.reduce((n, g) => n + g.count, 0)})`}
      </button>
      {open && (
        <div className="card repeat-review">
          <h2>Review repeated lines</h2>
          <p className="muted">
            Choose once for matching descriptions in the same account. Only
            unsorted lines change. Transfers do not count as income or spending.
          </p>
          {!groups.length && <p>No repeated lines left to sort.</p>}
          <div className="repeat-list">
            {groups.map((g) => (
              <div className="repeat-row" key={g.key}>
                <div>
                  <strong>{g.merchant}</strong>
                  <small>
                    {g.accountName} · {g.count} lines · <span className={hidden ? "amount-skeleton" : undefined} aria-label={hidden ? "Amount hidden" : undefined}>{money(g.total)}</span> net
                  </small>
                  {g.reason && <small>{g.reason}</small>}
                  <details>
                    <summary>Bank description</summary>
                    <p>{g.description}</p>
                  </details>
                </div>
                <CustomSelect
                  aria-label={`Category for ${g.merchant} in ${g.accountName}`}
                  value={choices[g.key] ?? g.category}
                  onChange={(e) =>
                    setChoices({ ...choices, [g.key]: e.target.value })
                  }
                >
                  <SelectOption value="">Leave unsorted</SelectOption>
                  <SelectOption value="__transfer">
                    Own-account transfer
                  </SelectOption>
                  {categories
                    .filter((c) => c.id !== "unsorted")
                    .map((c) => (
                      <SelectOption key={c.id} value={c.id}>
                        {c.name}
                      </SelectOption>
                    ))}
                  {!categories.some((c) => c.id === "bank-fees") && (
                    <SelectOption value="bank-fees">Bank fees</SelectOption>
                  )}
                </CustomSelect>
              </div>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Do this automatically for future matching lines in these accounts
          </label>
          <button disabled={busy || !count} onClick={save}>
            {busy ? "Sorting…" : `Apply to ${count} lines`}
          </button>
          {selected.length > 100 && (
            <p>Up to 100 groups are applied at a time.</p>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
