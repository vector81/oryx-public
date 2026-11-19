import "server-only";
import { query, run } from "./db";
import { ingest } from "./store";
import type { Account } from "./types";
type RemoteAccount = {
  id: string;
  name: string;
  account_number: string;
  status: string;
  currency: string;
};
type RemoteTx = {
  id: string;
  date: string;
  description: string;
  extended_description: string | null;
  status: string;
  amount: { amount: number; currency: string };
};
async function get<T>(path: string) {
  if (!process.env.REDBARK_API_KEY)
    throw new Error("Bank feed key is missing.");
  const url = new URL(path, "https://api.redbark.com");
  if (url.origin !== "https://api.redbark.com")
    throw new Error("Invalid bank feed URL.");
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.REDBARK_API_KEY}`,
      "Redbark-Version": "2026-10-01.wattle",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(40000),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Bank feed key was rejected. Update it in server settings."
        : r.status === 429
          ? "Bank feed is busy. Try again in a minute."
          : "Bank feed could not be reached. Try again shortly.",
    );
  return (await r.json()) as T;
}
export async function syncBank(
  accountId?: string,
  from = "2020-01-01",
  to = new Date().toISOString().slice(0, 10),
) {
  const remote = await get<{ data: RemoteAccount[] }>("/v2/accounts?limit=100");
  const local = await query<Account>("SELECT * FROM accounts");
  const results = [];
  let accountCount = 0;
  for (const a of remote.data) {
    const target = local.find(
      (l) => l.provider_id === a.id || l.last4 === a.account_number.slice(-4),
    );
    if (
      !target ||
      a.status !== "available" ||
      (accountId && target.id !== accountId)
    )
      continue;
    await run("UPDATE accounts SET provider_id=? WHERE id=?", [
      a.id,
      target.id,
    ]);
    let url: string | null =
      `/v2/transactions?account=${encodeURIComponent(a.id)}&from=${from}&to=${to}&limit=100&include_pending=false`;
    let seen = 0;
    while (url) {
      const page: { data: RemoteTx[]; next_page_url: string | null } =
        await get<{ data: RemoteTx[]; next_page_url: string | null }>(url);
      const rows = page.data.filter((t) => t.status === "posted");
      if (rows.some((t) => !Number.isSafeInteger(t.amount.amount)))
        throw new Error(
          "Bank returned an invalid amount. Nothing from this page was imported.",
        );
      results.push(
        await ingest(
          target.id,
          rows.map((t) => ({
            date: t.date,
            amount_cents: t.amount.amount,
            raw_description: [t.description, t.extended_description]
              .filter(Boolean)
              .join(" | "),
            running_balance_cents: null,
          })),
          `Redbark ${target.name}`,
          "redbark",
          rows.map((t) => t.id),
          rows.map((t) => t.amount.currency.toUpperCase()),
        ),
      );
      seen += page.data.length;
      if (seen >= 5000 && page.next_page_url)
        throw new Error(
          "Too much history in one request. Choose a shorter date range.",
        );
      url = page.next_page_url;
    }
    accountCount++;
    await run("UPDATE accounts SET synced_at=? WHERE id=?", [
      new Date().toISOString(),
      target.id,
    ]);
  }
  return {
    accounts: accountCount,
    rows_new: results.reduce((s, r) => s + r.rows_new, 0),
    rows_skipped: results.reduce((s, r) => s + r.rows_skipped, 0),
  };
}
