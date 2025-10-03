import { Router } from "express";
import { pool } from "../db";
import asyncHandler from "../utils/asyncHandler";

const router = Router();

// GET /api/services  → return PLAIN ARRAY (your UI expects array)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, active, limit = "100" } = req.query as Record<string, string | undefined>;

    const where: string[] = [];
    const args: any[] = [];
    let i = 1;

    if (q && q.trim()) {
      where.push(`(name ILIKE $${i} OR description ILIKE $${i})`);
      args.push(`%${q.trim()}%`); i++;
    }
    if (typeof active === "string") {
      const val = /^(1|true)$/i.test(active);
      where.push(`active = $${i}`); args.push(val); i++;
    }

    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    const sql = `
      SELECT id, name, description, pricing_model, base_rate, min_fee, active, created_at
      FROM services
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ${lim};
    `;
    const { rows } = await pool.query(sql, args);
    res.json(rows); // 👈 plain array (fixes "No packages available")
  })
);

export default router;
