import { pool } from '../../db';

//
// Catalog Service (DB layer)
// --------------------------
// Keep SQL/read/write here. Controllers should stay thin.
// NOTE: Avoid adding request/response types here—keep this layer pure.
//

type ProductFilters = {
  category?: string;
  typeName?: string;
  material?: string;
  uom?: string;
  active?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

/**
 * Fetch products with optional filters + basic pagination.
 * Uses parameterized WHERE clauses; LIMIT/OFFSET are interpolated as numbers.
 * TODO: If this grows, consider returning { rows, total } for UI pagination.
 */
export async function listProducts(f: ProductFilters = {}) {
  const where: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (f.category) { where.push(`category = $${i++}`); vals.push(f.category); }
  if (f.typeName) { where.push(`type_name = $${i++}`); vals.push(f.typeName); }
  if (f.material) { where.push(`material = $${i++}`); vals.push(f.material); }
  if (f.uom)      { where.push(`uom = $${i++}`);      vals.push(f.uom); }
  if (typeof f.active === 'boolean') { where.push(`active = $${i++}`); vals.push(f.active); }

  // Simple text search across name + type_name.
  if (f.q) {
    where.push(`(name ILIKE $${i} OR type_name ILIKE $${i})`);
    vals.push(`%${f.q}%`);
    i++;
  }

  // NOTE: LIMIT/OFFSET can’t be bound as params in many drivers; make sure these are numbers upstream.
  const limit = f.limit ?? 100;
  const offset = f.offset ?? 0;

  const sql = `
    SELECT * FROM products
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // TIP: Add indexes on (created_at), (category), (type_name), (material), (active), and a trigram on name for search if needed.
  const { rows } = await pool.query(sql, vals);
  return rows;
}

/**
 * Insert a product.
 * TODO: Validate payload (name, category, uom, base_price >= 0) before insert.
 */
export async function createProduct(body: any) {
  const { name, category, type_name, material, uom, base_price = 0, active = true } = body;

  const { rows } = await pool.query(
    `INSERT INTO products (name, category, type_name, material, uom, base_price, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [name, category, type_name, material, uom, base_price, active]
  );

  return rows[0];
}

/**
 * Return active services (e.g., install/survey packages).
 * Kept simple—no filters yet.
 */
export async function listServices() {
  const { rows } = await pool.query(
    `SELECT * FROM services WHERE active = true ORDER BY created_at DESC`
  );
  return rows;
}

/**
 * Insert a service package.
 * TODO: Validate pricing_model enum, base_rate/min_fee >= 0.
 */
export async function createService(body: any) {
  const { name, description, pricing_model, base_rate = 0, min_fee = 0, active = true } = body;

  const { rows } = await pool.query(
    `INSERT INTO services (name, description, pricing_model, base_rate, min_fee, active)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [name, description ?? null, pricing_model, base_rate, min_fee, active]
  );

  return rows[0];
}

type RepairFilters = { category?: string; uom?: string; q?: string; };

/**
 * Fetch repairs with light filters.
 * NOTE: No pagination for now—dataset expected to be small.
 */
export async function listRepairs(f: RepairFilters = {}) {
  const where: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (f.category) { where.push(`category = $${i++}`); vals.push(f.category); }
  if (f.uom)      { where.push(`uom = $${i++}`);      vals.push(f.uom); }
  if (f.q) {
    // Case-insensitive search on title + description.
    where.push(`(title ILIKE $${i} OR COALESCE(description,'') ILIKE $${i})`);
    vals.push(`%${f.q}%`);
    i++;
  }

  const { rows } = await pool.query(
    `SELECT * FROM repairs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC`,
    vals
  );

  return rows;
}

/**
 * Insert a repair record (can be linked to product/service).
 * Optional fields stored as NULL when not provided.
 */
export async function createRepair(body: any) {
  const { category, product_id, service_id, title, description, uom, est_hours, price_estimate } = body;

  const { rows } = await pool.query(
    `INSERT INTO repairs (category, product_id, service_id, title, description, uom, est_hours, price_estimate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      category,
      product_id ?? null,
      service_id ?? null,
      title,
      description ?? null,
      uom,
      est_hours ?? null,
      price_estimate ?? null
    ]
  );

  return rows[0];
}

/**
 * List active materials with latest unit_cost (via correlated subquery).
 * TIP: For performance, index material_price_history on (material_id, effective_from DESC).
 */
export async function listMaterials() {
  const { rows } = await pool.query(`
    SELECT m.*, (
      SELECT unit_cost
      FROM material_price_history mph
      WHERE mph.material_id = m.id
      ORDER BY effective_from DESC
      LIMIT 1
    ) AS latest_unit_cost
    FROM materials m
    WHERE active = true
    ORDER BY m.name
  `);

  return rows;
}

/**
 * Create a material and (optionally) seed current price in price history.
 * Wrapped in a transaction to keep material + price insert atomic.
 * TODO: Consider validating effective_from (timezone) and unit_cost >= 0.
 */
export async function createMaterial(body: any) {
  const { name, uom, supplier_id, active = true, unit_cost, effective_from } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO materials (name, uom, supplier_id, active)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [name, uom, supplier_id ?? null, active]
    );

    const mat = rows[0];

    // If we got a unit_cost, record the latest price entry as well.
    if (unit_cost) {
      await client.query(
        `INSERT INTO material_price_history (material_id, effective_from, unit_cost)
         VALUES ($1,$2,$3)`,
        [mat.id, effective_from ?? new Date(), unit_cost]
      );
    }

    await client.query('COMMIT');
    return mat;
  } catch (e) {
    // Roll back on any error to keep state consistent.
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
