import { db } from "../../db";

export type SearchParams = {
  q?: string;
  has?: "email" | "phone" | "both" | "none";
  channel?: string;
  min_satisfaction?: number;
  limit: number; // caller clamps this; we just trust it here
};

/**
 * Search customers with a few practical filters.
 * Keep the SQL readable; heavier mapping/validation should live above us.
 */
export async function searchCustomers(params: SearchParams) {
  const { q, has, channel, min_satisfaction, limit } = params;

  const where: string[] = [];
  const values: any[] = [];

  // Text search across basic contact fields.
  // NOTE: Using ILIKE for simplicity; consider trigram/GIN indexes for scale.
  if (q && q.length > 0) {
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    // Parameter slots are fixed here ($1..$4) because we push 4 values in one go.
    where.push(
      `(c.name ILIKE $1 OR c.email ILIKE $2 OR c.phone ILIKE $3 OR COALESCE(c.postcode,'') ILIKE $4)`
    );
  }

  // Contact presence filters (mutually exclusive)
  if (has === "email") {
    where.push(`c.email IS NOT NULL AND c.email <> ''`);
  } else if (has === "phone") {
    where.push(`c.phone IS NOT NULL AND c.phone <> ''`);
  } else if (has === "both") {
    where.push(`(c.email IS NOT NULL AND c.email <> '' AND c.phone IS NOT NULL AND c.phone <> '')`);
  } else if (has === "none") {
    where.push(`(COALESCE(c.email,'') = '' AND COALESCE(c.phone,'') = '')`);
  }

  // Exact channel match (if provided)
  if (channel && channel.length > 0) {
    values.push(channel);
    // Use current length as the placeholder index.
    where.push(`c.interaction_channel = $${values.length}`);
  }

  // Satisfaction threshold (>=)
  if (typeof min_satisfaction === "number" && Number.isFinite(min_satisfaction)) {
    values.push(min_satisfaction);
    where.push(`COALESCE(c.satisfaction,0) >= $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      COALESCE(c.satisfaction, 0) AS satisfaction,
      c.interaction_channel,
      c.postcode,
      c.created_at
    FROM customers c
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT $${values.length + 1};
  `;

  // NOTE: db.many() throws if zero rows. If you prefer [], use manyOrNone().
  return db.many(sql, [...values, limit]); // returns an array when rows exist
}

/**
 * Fetch single customer by id (UUID).
 * Returns null when not found.
 */
export async function getCustomerById(id: string) {
  const sql = `
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      COALESCE(c.satisfaction, 0) AS satisfaction,
      c.interaction_channel,
      c.postcode,
      c.created_at
    FROM customers c
    WHERE c.id = $1
  `;

  return db.oneOrNone(sql, [id]); //  row or null
}
