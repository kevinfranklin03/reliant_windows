import { Router } from "express";
import { pool } from "../../db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// GET /api/customers
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, has, channel, min_satisfaction, limit = "50" } =
      req.query as Record<string, string | undefined>;

    const where: string[] = [];
    const args: any[] = [];
    let i = 1;

    if (q && q.trim()) {
      where.push(`(name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i} OR postcode ILIKE $${i})`);
      args.push(`%${q.trim()}%`); i++;
    }
    if (has === "email") where.push(`email IS NOT NULL AND email <> ''`);
    else if (has === "phone") where.push(`phone IS NOT NULL AND phone <> ''`);
    else if (has === "both") where.push(`email <> '' AND phone <> ''`);
    else if (has === "none") where.push(`((email IS NULL OR email='') AND (phone IS NULL OR phone=''))`);

    if (channel && channel.trim()) {
      where.push(`interaction_channel = $${i}`); args.push(channel.trim()); i++;
    }

    const minSatNum = Number(min_satisfaction);
    if (!Number.isNaN(minSatNum) && minSatNum >= 1 && minSatNum <= 5) {
      where.push(`satisfaction >= $${i}`); args.push(minSatNum); i++;
    }

    const lim = Math.max(1, Math.min(500, Number(limit) || 50));
    const sql = `
      SELECT id, name, email, phone, satisfaction, postcode, interaction_channel, created_at
      FROM customers
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ${lim};
    `;
    const { rows } = await pool.query(sql, args);
    res.json({ rows });
  })
);

export default router;
