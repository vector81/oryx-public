import { equal } from "@/lib/auth";
import { syncBank } from "@/lib/redbark";
import { today } from "@/lib/money";
import { after } from "next/server";
import { drainAiSort } from "@/lib/ai-sort";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    !equal(
      request.headers.get("authorization") || "",
      `Bearer ${process.env.CRON_SECRET}`,
    )
  )
    return new Response("Not found", { status: 404 });
  const from = new Date(today() + "T12:00:00Z");
  from.setUTCDate(from.getUTCDate() - 7);
  after(async () => { await drainAiSort('all', 120000); });
  try {
    return Response.json(
      await syncBank(undefined, from.toISOString().slice(0, 10), today()),
    );
  } catch {
    return Response.json(
      { error: "Bank sync failed. Retry from Import." },
      { status: 503 },
    );
  }
}
