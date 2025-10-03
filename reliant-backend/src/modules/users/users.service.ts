import { pool } from '../../db';

//
// Users Service (DB layer)
// ------------------------
// Keep SQL here; controllers stay thin.
// TODO: add input validation (Zod) in controller/service boundary.
//

/** List all users (no filters yet). */
export async function listUsers() {
  // TIP: consider adding pagination if this grows.
  const { rows } = await pool.query(
    `SELECT id, email, name, role, created_at
     FROM users
     ORDER BY created_at DESC`
  );
  return rows;
}

/** Create a user. */
export async function createUser(body: any) {
  // NOTE: role defaults to 'staff'; api_key is optional.
  // TODO: enforce unique email at DB level and map constraint errors.
  const { email, name, role = 'staff', api_key = null } = body;

  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, api_key)
     VALUES ($1,$2,$3,$4)
     RETURNING id, email, name, role, created_at`,
    [email ?? null, name ?? null, role, api_key ?? null]
  );

  return rows[0];
}

/**
 * Patch a user by id.
 * Unknown keys will be passed through—controller should whitelist if needed.
 */
export async function updateUser(id: string, patch: any) {
  const fields: string[] = [];
  const vals: any[] = [];
  let i = 1;

  // Build dynamic SET list (skip undefineds so clients can omit fields).
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = $${i++}`);
    vals.push(v);
  }

  // No fields to update? Return current row (handy for idempotent calls).
  if (!fields.length) {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, created_at
       FROM users
       WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  // Execute UPDATE and return the new values.
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE users
     SET ${fields.join(', ')}
     WHERE id = $${i}
     RETURNING id, email, name, role, created_at`,
    vals
  );

  return rows[0] ?? null;
}

/** Hard delete a user (returns true when a row was removed). */
export async function deleteUser(id: string) {
  const { rowCount } = await pool.query(
    `DELETE FROM users WHERE id = $1`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}
