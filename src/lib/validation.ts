import { z } from "zod";
export const date = z.iso.date();
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const entity = z.enum(["me", "business-one", "business-two", "all"]);
export const changes = z
  .object({
    category_id: z.string().max(80).optional(),
    person_id: z.string().max(80).nullable().optional(),
    trip_id: z.string().max(80).nullable().optional(),
    note: z.string().max(4000).optional(),
    merchant: z.string().min(1).max(200).optional(),
    kind: z.enum(["income", "spend", "transfer", "debt"]).optional(),
    reimbursable: z.boolean().optional(),
    reimbursed: z.boolean().optional(),
    reviewed: z.number().int().min(0).max(1).optional(),
  })
  .strict();
export const rule = z
  .object({
    pattern: z.string().min(2).max(2400),
    merchant: z.string().max(200).nullable().default(null),
    category_id: z.string().nullable().default(null),
    person_id: z.string().nullable().default(null),
    kind: z
      .enum(["income", "spend", "transfer", "debt"])
      .nullable()
      .default(null),
    entity: z.enum(["me", "business-one", "business-two"]).nullable().default(null),
  })
  .strict();
export const filters = z
  .object({
    month: month.optional(),
    entity: entity.optional(),
    account: z.string().optional(),
    category: z.string().optional(),
    person: z.string().optional(),
    trip: z.string().optional(),
    kind: z.enum(["income", "spend", "transfer", "debt"]).optional(),
    direction: z.enum(["in", "out"]).optional(),
    query: z.string().max(200).optional(),
    from: date.optional(),
    to: date.optional(),
    reimbursable: z.boolean().optional(),
    unsorted: z.boolean().optional(),
    limit: z.number().int().min(1).max(10000).optional(),
    page: z.number().int().min(1).optional(),
  })
  .strict();
