import { pool } from "../../db";

export type ListCustomersParams = {
  q?: string;
  has?: "email" | "phone" | "both" | "none";
  channel?: string;
  min_satisfaction?: string | number;
  limit?: string | number;
  include_archived?: string;
  only_archived?: string;
};

export async function listCustomers(params: ListCustomersParams) {
  const {
    q,
    has,
    channel,
    min_satisfaction,
    limit = "50",
    include_archived,
    only_archived,
  } = params;

  const where: string[] = [];
  const args: any[] = [];
  let i = 1;

  // archived filters (unchanged logic)
  const includeArchived = include_archived === "true";
  const onlyArchived = only_archived === "true";
  if (onlyArchived) where.push(`archived_at IS NOT NULL`);
  else if (!includeArchived) where.push(`archived_at IS NULL`);

  if (q && q.trim()) {
    where.push(
      `(name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i} OR postcode ILIKE $${i})`
    );
    args.push(`%${q.trim()}%`);
    i++;
  }

  if (has === "email") where.push(`email IS NOT NULL AND email <> ''`);
  else if (has === "phone") where.push(`phone IS NOT NULL AND phone <> ''`);
  else if (has === "both")
    where.push(
      `email IS NOT NULL AND email <> '' AND phone IS NOT NULL AND phone <> ''`
    );
  else if (has === "none")
    where.push(`( (email IS NULL OR email='') AND (phone IS NULL OR phone='') )`);

  if (channel && channel.trim()) {
    where.push(`interaction_channel = $${i}`);
    args.push(channel.trim());
    i++;
  }

  const minSatNum = Number(min_satisfaction);
  if (!Number.isNaN(minSatNum) && minSatNum >= 1 && minSatNum <= 5) {
    where.push(`satisfaction >= $${i}`);
    args.push(minSatNum);
    i++;
  }

  const lim = Math.max(1, Math.min(500, Number(limit) || 50));

  const sql = `
    SELECT id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at
    FROM customers
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ${lim};
  `;

  const { rows } = await pool.query(sql, args);
  return rows;
}

export async function getCustomerById(id: string) {
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at
     FROM customers WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export type CreateCustomerInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  satisfaction?: number | null;
  postcode?: string | null;
  interaction_channel?: string | null;
};

export async function createCustomer(input: CreateCustomerInput) {
  const { name, email, phone, satisfaction, postcode, interaction_channel } =
    input ?? {};
  const { rows } = await pool.query(
    `INSERT INTO customers (name, email, phone, satisfaction, postcode, interaction_channel)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at`,
    [
      name ?? null,
      email ?? null,
      phone ?? null,
      satisfaction ?? null,
      postcode ?? null,
      interaction_channel ?? null,
    ]
  );
  return rows[0];
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const allowed = [
    "name",
    "email",
    "phone",
    "satisfaction",
    "postcode",
    "interaction_channel",
  ] as const;

  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;

  for (const k of allowed) {
    if (k in (input ?? {})) {
      sets.push(`${k} = $${i++}`);
      args.push((input as any)[k]);
    }
  }
  if (sets.length === 0) return null;

  args.push(id);
  const { rows } = await pool.query(
    `UPDATE customers SET ${sets.join(", ")} WHERE id = $${i}
     RETURNING id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at`,
    args
  );
  return rows[0] ?? null;
}

export async function archiveCustomer(id: string) {
  const { rows } = await pool.query(
    `UPDATE customers
       SET archived_at = NOW()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at`,
    [id]
  );
  return rows[0] ?? null;
}

export async function unarchiveCustomer(id: string) {
  const { rows } = await pool.query(
    `UPDATE customers
       SET archived_at = NULL
     WHERE id = $1 AND archived_at IS NOT NULL
     RETURNING id, name, email, phone, satisfaction, postcode, interaction_channel, archived_at, created_at`,
    [id]
  );
  return rows[0] ?? null;
}

export async function deleteCustomer(id: string) {
  // conflict pre-check (unchanged behaviour)
  const { rows: cntRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM quotes WHERE customer_id = $1`,
    [id]
  );
  const n = cntRows[0]?.n ?? 0;
  if (n > 0) {
    return { deleted: false, conflict: true, quotes_count: n };
  }

  // ✅ rowCount can be null -> coalesce to 0
  const result = await pool.query(`DELETE FROM customers WHERE id = $1`, [id]);
  const rowCount = result.rowCount ?? 0;
  return { deleted: rowCount > 0, conflict: false };
}
