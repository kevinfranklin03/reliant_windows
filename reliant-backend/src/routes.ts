import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db";

import * as QuotesController from "./modules/quotes/quotes.controller";
import * as CustomersController from "./modules/customers/customers.controller";
import summarizeNotes from "./services/notes.summarize";

const router = Router();

/** Health (public is handled in server.ts; this is a duplicate-safe route if needed) */
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ============================
 * Customers
 * ============================ */
router.get("/customers", CustomersController.list);
router.get("/customers/:id", CustomersController.getById);
router.post("/customers", CustomersController.create);
router.patch("/customers/:id", CustomersController.update);
router.delete("/customers/:id", CustomersController.remove);
router.post("/customers/:id/archive", CustomersController.archive);
/* ============================
 * Quotes
 * ============================ */
router.get("/quotes", QuotesController.list);
router.get("/quotes/:id", QuotesController.getById);
router.put("/quotes/:id", QuotesController.update);
router.patch("/quotes/:id/status", QuotesController.updateStatus);
router.delete("/quotes/:id", QuotesController.remove);
router.post("/quotes", QuotesController.createQuote);
router.post("/ai-suggest-price", QuotesController.aiSuggestPrice);

/* ============================
 * Products
 * ============================ */
router.get("/products", async (req, res, next) => {
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
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ============================
 * Services
 * ============================ */
router.get("/services", async (req, res, next) => {
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
});

/* ============================
 * Notes summarizer 
 * ============================ */
router.post("/ai-summarize-notes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, maxWords, maxSentences } = (req.body ?? {}) as {
      text?: string;
      maxWords?: number | string;
      maxSentences?: number | string;
    };

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ ok: false, error: "Missing 'text' to summarize." });
    }

    const words =
      Number(maxWords) || (Number(maxSentences) ? Number(maxSentences) * 15 : 60);

    const summary = await summarizeNotes(text, words);
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
