interface Env {
  DB: D1Database;
  DATA_TOKEN: string;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const a = new TextEncoder().encode(
      request.headers.get("authorization") || "",
    );
    const b = new TextEncoder().encode(`Bearer ${env.DATA_TOKEN}`);
    if (
      !env.DATA_TOKEN ||
      a.length !== b.length ||
      !crypto.subtle.timingSafeEqual(a, b)
    )
      return new Response("Not found", { status: 404 });
    if (request.method !== "POST")
      return new Response("Not found", { status: 404 });
    try {
      const body = (await request.json()) as {
        statements: { sql: string; params: unknown[] }[];
        raw?: boolean;
      };
      if (!Array.isArray(body.statements) || body.statements.length > 100)
        return new Response("Invalid request", { status: 400 });
      const statements = body.statements.map((s) =>
        env.DB.prepare(s.sql).bind(...s.params),
      );
      const results = await env.DB.batch(statements);
      return Response.json(results, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json(
        { error: "Database request failed" },
        { status: 500 },
      );
    }
  },
};
