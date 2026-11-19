import "server-only";
export type Statement = { sql: string; params: unknown[] };
export async function batch(statements: Statement[]) {
  if (!process.env.DATA_URL || !process.env.DATA_TOKEN)
    throw new Error("Database connection is not ready. Try again shortly.");
  const r = await fetch(process.env.DATA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DATA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statements }),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error("Could not reach the database. Please try again.");
  return (await r.json()) as {
    results: Record<string, unknown>[];
    meta: { changes: number };
  }[];
}
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await batch([{ sql, params }]))[0].results as T[];
}
export async function run(sql: string, params: unknown[] = []) {
  return (await batch([{ sql, params }]))[0];
}
