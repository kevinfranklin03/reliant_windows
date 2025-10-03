import { Router } from "express";
import { pool } from "../../db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// GET /api/products  → return PLAIN ARRAY (your UI expects array)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { active, category, material, search, limit = "200" } =
      req.query as Record<string, string | undefined>;

    const where: string[] = [];
    const args: any[] = [];
    let i = 1;

    if (active !== undefined) { where.push(`active = $${i++}`); args.push(active === "true"); }
    if (category) { where.push(`category = $${i++}`); args.push(category); }
    if (material) { where.push(`material = $${i++}`); args.push(material); }
    if (search && search.trim()) {
      where.push(`(name ILIKE $${i} OR type_name ILIKE $${i} OR material ILIKE $${i})`);
      args.push(`%${search.trim()}%`); i++;
    }

    const lim = Math.max(1, Math.min(500, Number(limit) || 200));
    const sql = `
      SELECT id, name, category, type_name, material, uom, base_price, active, created_at
      FROM products
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ${lim};
    `;
    const { rows } = await pool.query(sql, args);
    res.json(rows); // 👈 plain array
  })
);

export default router;
