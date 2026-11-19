import { NextResponse, after } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticated, sameOrigin } from "@/lib/auth";
import {
  dashboard,
  transactions,
  updateTransaction,
  addRule,
  ingest,
} from "@/lib/store";
import { query, run } from "@/lib/db";
import { bankCsv, parseCardText } from "@/lib/importers";
import { syncBank } from "@/lib/redbark";
import * as v from "@/lib/validation";
import { today } from "@/lib/money";
import { logDebtPayment } from "@/lib/debts";
import { applyRepeatSort } from "@/lib/repeat-sort";
import { aiSortStatus, runAiSort, undoAiSort, approveAiSuggestions, drainAiSort } from "@/lib/ai-sort";
export const maxDuration = 300;
export async function GET(r: Request) {
  try {
    if (!(await authenticated()))
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const p = new URL(r.url).searchParams;
    const action = p.get("action");
    if (action === "ai-sort") return NextResponse.json(await aiSortStatus(v.entity.parse(p.get("entity") || "me")));
    if (action === "transactions") {
      const filters = v.filters.parse(JSON.parse(p.get("filters") || "{}"));
      return NextResponse.json(await transactions(filters));
    }
    if (action === "detail") {
      const id = z.string().min(1).parse(p.get("id"));
      return NextResponse.json({
        children: await query("SELECT * FROM transactions WHERE parent_id=?", [
          id,
        ]),
      });
    }
    if (action === "export") {
      const rows = await query(
        "SELECT t.*,a.name account,a.entity FROM transactions t JOIN accounts a ON a.id=t.account_id ORDER BY date",
      );
      const fields = [
        "id",
        "date",
        "account",
        "entity",
        "amount_cents",
        "currency",
        "raw_description",
        "merchant",
        "category_id",
        "kind",
        "person_id",
        "trip_id",
        "note",
        "reimbursable",
        "reimbursed",
        "source",
      ];
      const cell = (val: unknown) => {
        let s = String(val ?? "");
        if (/^[=+@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      return new Response(
        [
          fields.join(","),
          ...rows.map((row) => fields.map((f) => cell(row[f])).join(",")),
        ].join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="oryx-transactions.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return NextResponse.json(
      await dashboard(
        v.month.parse(p.get("month") || today().slice(0, 7)),
        v.entity.parse(p.get("entity") || "me"),
      ),
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check the filters and try again."
            : e instanceof Error
              ? e.message
              : "Could not load your data.",
      },
      { status: 400 },
    );
  }
}
export async function POST(r: Request) {
  try {
    if (!(await authenticated()))
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (!sameOrigin(r))
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const b = await r.json();
    let result: unknown = { ok: true };
    switch (b.action) {
      case "ai-approve":
        result = await approveAiSuggestions(v.entity.parse(b.entity));
        break;
      case "ai-sort":
        result = await runAiSort(v.entity.parse(b.entity));
        break;
      case "ai-undo":
        result = await undoAiSort(z.string().min(1).max(100).parse(b.id));
        break;
      case "update": {
        const x = z.object({ id: z.string(), changes: v.changes }).parse(b);
        await updateTransaction(x.id, x.changes);
        break;
      }
      case "bulk": {
        const x = z
          .object({
            ids: z.array(z.string()).min(1).max(200),
            changes: v.changes,
          })
          .parse(b);
        for (const id of x.ids) await updateTransaction(id, x.changes);
        break;
      }
      case "rule":
        result = await addRule(v.rule.parse(b.rule));
        break;
      case "repeat-sort": {
        const x = z
          .object({
            groups: z
              .array(
                z.object({
                  account: z.string().min(1).max(100),
                  description: z.string().min(1).max(2000),
                  category: z.string().min(1).max(100),
                }),
              )
              .min(1)
              .max(100)
              .refine(
                (gs) =>
                  new Set(gs.map((g) => g.account + "|" + g.description))
                    .size === gs.length,
              ),
            remember: z.boolean(),
          })
          .parse(b);
        result = await applyRepeatSort(x.groups, x.remember);
        break;
      }
      case "delete-rule":
        await run("DELETE FROM rules WHERE id=?", [z.string().parse(b.id)]);
        break;
      case "category": {
        const name = z.string().min(1).max(80).parse(b.name);
        await run("INSERT INTO categories(id,name) VALUES(?,?)", [
          randomUUID(),
          name,
        ]);
        break;
      }
      case "person": {
        const name = z.string().min(1).max(80).parse(b.name);
        const id = randomUUID();
        await run("INSERT INTO people(id,name) VALUES(?,?)", [id, name]);
        result = { id, name };
        break;
      }
      case "trip": {
        const x = z
          .object({
            name: z.string().min(1).max(80),
            start_date: v.date,
            end_date: v.date,
          })
          .parse(b);
        if (x.end_date < x.start_date)
          throw new Error("Trip end must be after its start.");
        const id = randomUUID();
        await run("INSERT INTO trips VALUES(?,?,?,?)", [
          id,
          x.name,
          x.start_date,
          x.end_date,
        ]);
        result = { id, ...x };
        break;
      }
      case "account": {
        const x = z
          .object({
            id: z.string(),
            name: z.string().min(1).max(80),
            entity: z.enum(["me", "business-one", "business-two"]),
            active: z.boolean(),
          })
          .parse(b);
        await run("UPDATE accounts SET name=?,entity=?,active=? WHERE id=?", [
          x.name,
          x.entity,
          Number(x.active),
          x.id,
        ]);
        break;
      }
      case "debt": {
        const x = z
          .object({
            id: z.string(),
            balance_cents: z.number().int().min(0),
            payment_cents: z.number().int().min(0),
            annual_minimum_cents: z.number().int().min(0).nullable(),
            note: z.string().max(2000),
          })
          .parse(b);
        await run(
          "UPDATE debts SET balance_cents=?,payment_cents=?,annual_minimum_cents=?,note=? WHERE id=?",
          [
            x.balance_cents,
            x.payment_cents,
            x.annual_minimum_cents,
            x.note,
            x.id,
          ],
        );
        break;
      }
      case "payment": {
        const x = z
          .object({
            debt_id: z.string(),
            amount_cents: z.number().int().positive(),
            date: v.date,
          })
          .parse(b);
        await logDebtPayment(x.debt_id, x.amount_cents, x.date);
        break;
      }
      case "sync": {
        const x = z
          .object({
            account: z.string().optional(),
            from: v.date.optional(),
            to: v.date.optional(),
          })
          .parse(b);
        result = await syncBank(x.account, x.from, x.to);
        break;
      }
      case "import": {
        const x = z
          .object({
            account: z.string(),
            filename: z.string().max(200),
            content: z.string().max(10000000),
            format: z.enum(["csv", "pdf"]),
          })
          .parse(b);
        let rows;
        if (x.format === "pdf") {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({
            data: Buffer.from(x.content, "base64"),
          });
          try {
            rows = parseCardText((await parser.getText()).text);
          } finally {
            await parser.destroy();
          }
        } else rows = bankCsv.parse(x.content);
        if (rows.length > 10000)
          throw new Error("Import up to 10,000 rows per file.");
        result = await ingest(x.account, rows, x.filename, x.format);
        break;
      }
      default:
        throw new Error("Unknown action.");
    }
    if (["update", "bulk", "rule", "repeat-sort", "sync", "import", "category"].includes(b.action)) {
      after(async () => { await drainAiSort('all'); });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Some details are missing or invalid. Check the form."
            : e instanceof Error
              ? e.message
              : "Could not save. Please try again.",
      },
      { status: 400 },
    );
  }
}
