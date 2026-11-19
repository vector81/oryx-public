import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  entity: text("entity").notNull(),
  type: text("type").notNull(),
  last4: text("last4"),
  active: integer("active").notNull(),
});
