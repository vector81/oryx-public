import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { equal, origin } from "@/lib/auth";
import {
  accounts,
  dashboard,
  transactions,
  updateTransaction,
  addRule,
  ingest,
  withFormatted,
} from "@/lib/store";
import { query, run } from "@/lib/db";
import { bankCsv } from "@/lib/importers";
import { money, today, summary } from "@/lib/money";
import * as v from "@/lib/validation";
import { logDebtPayment } from "@/lib/debts";
import type { Debt } from "@/lib/types";
export const maxDuration = 300;
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
  if (!process.env.MCP_TOKEN || !equal(token, process.env.MCP_TOKEN))
    return new Response("Not found", { status: 404 });
  if (req.headers.get("origin") && req.headers.get("origin") !== origin())
    return new Response("Forbidden", { status: 403 });
  const server = new McpServer({ name: "oryx", version: "1.0.0" });
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  const result = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });
  const period = {
    period: v.month.default(today().slice(0, 7)),
    entity: v.entity.default("me"),
  };
  server.registerTool(
    "oryx_capabilities",
    {
      description:
        "Private money records. Never pays, transfers or moves money. All amounts are signed integer cents. AUD totals exclude foreign currencies. Timezone UTC.",
      inputSchema: {},
      annotations: read,
    },
    async () =>
      result({
        read_only_on_money: true,
        entities: ["me", "business-one", "business-two", "all"],
        timezone: "UTC",
        week_start: "Monday",
        sources: ["redbark", "bankCsv_csv", "credit_pdf"],
        write_scope:
          "Records, categories, rules and logged debt payments only. No transaction deletion.",
      }),
  );
  server.registerTool(
    "oryx_accounts_list",
    { inputSchema: {}, annotations: read },
    async () => result(await accounts()),
  );
  server.registerTool(
    "oryx_summary",
    { inputSchema: period, annotations: read },
    async ({ period, entity }) => {
      const d = await dashboard(period, entity);
      return result({
        period,
        entity,
        ...Object.fromEntries(
          Object.entries(d.totals).map(([k, n]) => [
            k,
            { amount_cents: n, formatted: money(n) },
          ]),
        ),
        by_category: d.leaks.map((c) => ({ ...c, formatted: money(c.amount) })),
      });
    },
  );
  server.registerTool(
    "oryx_month_report",
    {
      inputSchema: { month: v.month, entity: v.entity.default("me") },
      annotations: read,
    },
    async ({ month, entity }) => {
      const rows = await transactions({ month, entity, limit: 10000 });
      const cats = await query<{ id: string; name: string }>(
        "SELECT * FROM categories",
      );
      return result({
        month,
        entity,
        categories: cats.map((c) => ({
          ...c,
          lines: rows.filter((t) => t.category_id === c.id).map(withFormatted),
        })),
        limit: 10000,
      });
    },
  );
  server.registerTool(
    "oryx_leaks",
    { inputSchema: period, annotations: read },
    async ({ period, entity }) =>
      result(
        (await dashboard(period, entity)).leaks.map((c) => ({
          ...c,
          amount_formatted: money(c.amount),
          average_formatted: money(c.average),
        })),
      ),
  );
  server.registerTool(
    "oryx_transactions_list",
    {
      inputSchema: {
        filters: v.filters.default({}),
        page: z.number().int().positive().default(1),
      },
      annotations: read,
    },
    async ({ filters, page }) =>
      result(
        (
          await transactions({
            ...filters,
            page,
            limit: Math.min(filters.limit || 100, 200),
          })
        ).map(withFormatted),
      ),
  );
  server.registerTool(
    "oryx_search",
    { inputSchema: { query: z.string().min(1).max(200) }, annotations: read },
    async ({ query }) =>
      result((await transactions({ query, limit: 200 })).map(withFormatted)),
  );
  server.registerTool(
    "oryx_unsorted_list",
    { inputSchema: {}, annotations: read },
    async () =>
      result(
        (await transactions({ unsorted: true, limit: 200 })).map(withFormatted),
      ),
  );
  server.registerTool(
    "oryx_people_summary",
    { inputSchema: { period: v.month }, annotations: read },
    async ({ period }) => {
      const rows = await transactions({ month: period, limit: 10000 });
      const people = await query<{ id: string; name: string }>(
        "SELECT * FROM people",
      );
      return result(
        people.map((p) => {
          const ts = rows.filter((t) => t.person_id === p.id);
          const gave = -ts.reduce((s, t) => s + Math.min(t.amount_cents, 0), 0),
            got = ts.reduce((s, t) => s + Math.max(t.amount_cents, 0), 0);
          return {
            ...p,
            gave_cents: gave,
            got_back_cents: got,
            net_cents: got - gave,
            net_formatted: money(got - gave),
          };
        }),
      );
    },
  );
  server.registerTool(
    "oryx_trip_summary",
    { inputSchema: { trip: z.string() }, annotations: read },
    async ({ trip }) => {
      const rows = await transactions({ trip, limit: 10000 });
      return result({
        trip,
        totals: summary(rows),
        lines: rows.map(withFormatted),
      });
    },
  );
  server.registerTool(
    "oryx_debts_list",
    { inputSchema: {}, annotations: read },
    async () =>
      result(
        (await query<Debt>("SELECT * FROM debts")).map((d) => ({
          ...d,
          balance_formatted: money(d.balance_cents, d.currency),
          payment_formatted: money(d.payment_cents, d.currency),
        })),
      ),
  );
  server.registerTool(
    "oryx_transaction_update",
    {
      inputSchema: {
        id: z.string(),
        category: z.string().optional(),
        person: z.string().nullable().optional(),
        trip: z.string().nullable().optional(),
        note: z.string().max(4000).optional(),
        flags: z
          .object({
            reimbursable: z.boolean().optional(),
            reimbursed: z.boolean().optional(),
            kind: z.enum(["income", "spend", "transfer", "debt"]).optional(),
          })
          .optional(),
      },
      annotations: write,
    },
    async ({ id, category, person, trip, note, flags }) => {
      const changes = v.changes.parse({
        ...(category ? { category_id: category, reviewed: 1 } : {}),
        ...(person !== undefined ? { person_id: person } : {}),
        ...(trip !== undefined ? { trip_id: trip } : {}),
        ...(note !== undefined ? { note } : {}),
        ...flags,
      });
      await updateTransaction(id, changes);
      return result({ ok: true });
    },
  );
  server.registerTool(
    "oryx_transactions_bulk_update",
    {
      inputSchema: {
        ids: z.array(z.string()).min(1).max(200),
        changes: v.changes,
      },
      annotations: write,
    },
    async ({ ids, changes }) => {
      for (const id of ids) await updateTransaction(id, changes);
      return result({ updated: ids.length });
    },
  );
  server.registerTool(
    "oryx_rule_add",
    { inputSchema: v.rule.shape, annotations: write },
    async (r) => result(await addRule(v.rule.parse(r))),
  );
  server.registerTool(
    "oryx_rule_list",
    { inputSchema: {}, annotations: read },
    async () => result(await query("SELECT * FROM rules")),
  );
  server.registerTool(
    "oryx_rule_delete",
    {
      inputSchema: { id: z.string() },
      annotations: { ...write, destructiveHint: true },
    },
    async ({ id }) => {
      await run("DELETE FROM rules WHERE id=?", [id]);
      return result({ ok: true });
    },
  );
  server.registerTool(
    "oryx_debt_update",
    {
      inputSchema: {
        id: z.string(),
        balance: z.number().int().nonnegative(),
        payment: z.number().int().nonnegative(),
      },
      annotations: write,
    },
    async ({ id, balance, payment }) => {
      const [debt] = await query<Debt>("SELECT * FROM debts WHERE id=?", [id]);
      if (!debt) throw new Error("Debt not found.");
      await run("UPDATE debts SET balance_cents=?,payment_cents=? WHERE id=?", [
        balance,
        payment,
        id,
      ]);
      return result({
        balance_cents: balance,
        formatted: money(balance, debt.currency),
      });
    },
  );
  server.registerTool(
    "oryx_debt_payment_add",
    {
      description: "Log a payment already made. Does not move money.",
      inputSchema: {
        debt_id: z.string(),
        amount: z.number().int().positive(),
        date: v.date,
      },
      annotations: write,
    },
    async ({ debt_id, amount, date }) => {
      const d = await logDebtPayment(debt_id, amount, date);
      return result({
        amount_cents: amount,
        formatted: money(amount, d.currency),
      });
    },
  );
  server.registerTool(
    "oryx_import",
    {
      description:
        "Import Bank CSV rows into one account. Reimporting the same file skips existing rows.",
      inputSchema: {
        account: z.string(),
        file_content: z.string().max(6000000),
        filename: z.string().max(200).default("MCP import.csv"),
      },
      annotations: write,
    },
    async ({ account, file_content, filename }) =>
      result(await ingest(account, bankCsv.parse(file_content), filename)),
  );
  server.registerTool(
    "oryx_import_status",
    { inputSchema: { id: z.string().optional() }, annotations: read },
    async ({ id }) =>
      result(
        await query(
          "SELECT * FROM imports " +
            (id ? "WHERE id=?" : "ORDER BY created_at DESC LIMIT 20"),
          id ? [id] : [],
        ),
      ),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Request failed. Check your input and try again.",
        },
      },
      { status: 500 },
    );
  } finally {
    await server.close();
  }
}
export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}
