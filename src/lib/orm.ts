import { drizzle } from "drizzle-orm/sqlite-proxy";
import { query } from "./db";
import * as schema from "./schema";
export const db = drizzle(
  async (sql, params, method) => {
    const rows = await query(sql, params);
    const values = rows.map((r) => Object.values(r));
    return { rows: method === "get" ? values[0] || [] : values };
  },
  { schema, logger: false },
);
