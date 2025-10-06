// src/modules/quotes/quotes.controller.ts
import { type Request, type Response, type NextFunction } from "express";
import { pool } from "../../db";
import {
  aiSuggestPriceService,
  createQuote as createQuoteService,
} from "./quotes.service";

/** GET /api/quotes */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, customer_id, limit = "50" } = req.query as Record<string, string | undefined>;

    const where: string[] = [];
    const args: any[] = [];
    let i = 1;

    if (status) {
      where.push(`status = $${i}`); args.push(status); i++;
    }
    if (customer_id) {
      where.push(`customer_id = $${i}`); args.push(customer_id); i++;
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

/** GET /api/quotes/:id */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, customer_id, status, service_type, timeframe, channel,
              site_postcode, total_net, total_gross, created_at, issued_at, accepted_at
       FROM quotes WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not Found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/quotes/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const allowed = [
      "customer_id",
      "status",
      "service_type",
      "timeframe",
      "channel",
      "site_postcode",
      "total_net",
      "total_gross",
      "issued_at",
      "accepted_at",
    ] as const;

    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;

    for (const k of allowed) {
      if (k in (req.body ?? {})) {
        sets.push(`${k} = $${i++}`);
        args.push((req.body as any)[k]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    args.push(id);
    const { rows } = await pool.query(
      `UPDATE quotes SET ${sets.join(", ")} WHERE id = $${i}
       RETURNING id, customer_id, status, service_type, timeframe, channel,
                 site_postcode, total_net, total_gross, created_at, issued_at, accepted_at`,
      args
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not Found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/quotes/:id/status */
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "Missing status" });

    const { rows } = await pool.query(
      `UPDATE quotes SET status = $1 WHERE id = $2
       RETURNING id, customer_id, status, service_type, timeframe, channel,
                 site_postcode, total_net, total_gross, created_at, issued_at, accepted_at`,
      [status, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not Found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/quotes/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM quotes WHERE id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: "Not Found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** POST /api/quotes */
export async function createQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      customer_id,
      status = "draft",
      service_type,
      timeframe,
      channel,
      site_postcode,
      total_net = 0,
      total_gross = 0,
      notes,
      base_cost = 0,
      material_cost = 0,
      labour_cost = 0,
      overhead_cost = 0,
      timeline_cost = 0,
      transport_cost = 0,
      service_fee = 0,
      ai_pred_cost = null,
      discount_pct = 0,
      vat_percent = 20,
      vat_amount = 0,
      items = [],
    } = req.body ?? {};

    // Use service helper to create header + items (optional), if you prefer:
    const result = await createQuoteService({
      customer_id,
      service_type,
      timeframe,
      channel,
      site_postcode,
      notes,
      base_cost,
      material_cost,
      labour_cost,
      overhead_cost,
      timeline_cost,
      transport_cost,
      service_fee,
      ai_pred_cost,
      discount_pct,
      vat_percent,
      vat_amount,
      total_net,
      total_gross,
      items,
    });

    res.status(201).json({ id: result.id, status: result.status });
  } catch (err) {
    next(err);
  }
}

/** POST /api/ai-suggest-price — supports cost-based and items-based payloads */
export async function aiSuggestPrice(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await aiSuggestPriceService(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
