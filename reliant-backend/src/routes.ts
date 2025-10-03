import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db"; // your existing pg Pool

import * as quotes from "./modules/quotes/quotes.controller";
import * as QuotesController from "./modules/quotes/quotes.controller";

const router = Router();

/** Health (public is handled in server.ts; this is a duplicate-safe route if needed) */
router.get("/health", (_req, res) => res.json({ ok: true }));

/** GET /api/customers */
router.get(
  "/customers",
  // Example: require manager+ to read customers (tweak/remove as you wish)
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, has, channel, min_satisfaction, limit = "50" } = req.query as Record<
        string,
        string | undefined
      >;

      const where: string[] = [];
      const args: any[] = [];
      let i = 1;

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
        where.push(`email IS NOT NULL AND email <> '' AND phone IS NOT NULL AND phone <> ''`);
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
        SELECT id, name, email, phone, satisfaction, postcode, interaction_channel, created_at
        FROM customers
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT ${lim};
      `;

      const { rows } = await pool.query(sql, args);
      res.json({ rows });
    } catch (err) {
      next(err);
    }
  }
);

// src/routes.ts (products)
router.get(
  "/products",
  async (req, res, next) => {
    try {
      const { active, category, material, search, limit = "200" } =
        req.query as Record<string, string | undefined>;

      const where: string[] = [];
      const args: any[] = [];
      let i = 1;

      if (active !== undefined) {
        where.push(`active = $${i++}`);
        args.push(active === "true");
      }
      if (category) {
        where.push(`category = $${i++}`);
        args.push(category);
      }
      if (material) {
        where.push(`material = $${i++}`);
        args.push(material);
      }
      if (search && search.trim()) {
        where.push(`(name ILIKE $${i} OR type_name ILIKE $${i} OR material ILIKE $${i})`);
        args.push(`%${search.trim()}%`);
        i++;
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

      // Return a plain array for the frontend
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);


/** GET /api/quotes (basic) */
router.get(
  "/quotes",
  quotes.list ,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, customer_id, limit = "50" } = req.query as Record<
        string,
        string | undefined
      >;
      const where: string[] = [];
      const args: any[] = [];
      let i = 1;

      if (status) {
        where.push(`status = $${i}`);
        args.push(status);
        i++;
      }
      if (customer_id) {
        where.push(`customer_id = $${i}`);
        args.push(customer_id);
        i++;
      }

      const lim = Math.max(1, Math.min(200, Number(limit) || 50));

      const sql = `
        SELECT id, customer_id, status, service_type, timeframe, channel,
               site_postcode, total_net, total_gross, created_at, issued_at, accepted_at
        FROM quotes
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT ${lim};
      `;

      const { rows } = await pool.query(sql, args);
      res.json({ rows });
    } catch (err) {
      next(err);
    }
  }
);
// AFTER
router.get("/quotes/:id", quotes.getById);

// src/routes.ts
router.get(
  "/services",
  async (req, res, next) => {
    try {
      const { active, search, limit = "200" } = req.query as Record<string, string | undefined>;

      const where: string[] = [];
      const args: any[] = [];
      let i = 1;

      if (active === "true" || active === "false") {
        where.push(`active = $${i++}`);
        args.push(active === "true");
      }

      if (search && search.trim()) {
        where.push(`(name ILIKE $${i} OR description ILIKE $${i})`);
        args.push(`%${search.trim()}%`);
        i++;
      }

      const lim = Math.max(1, Math.min(500, Number(limit) || 200));

      const sql = `
        SELECT id, name, description, pricing_model, base_rate, min_fee, active, created_at
        FROM services
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT ${lim};
      `;
      const { rows } = await pool.query(sql, args);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);


// Mutations (no backend role guard)
router.put("/quotes/:id", quotes.update);
router.patch("/quotes/:id/status", quotes.updateStatus);
router.delete("/quotes/:id", quotes.remove);

router.post("/quotes", QuotesController.createQuote);

router.post("/quotes/ai-suggest", QuotesController.aiSuggestPrice);

export default router;
