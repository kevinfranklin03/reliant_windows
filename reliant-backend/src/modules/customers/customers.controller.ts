import { Request, Response, NextFunction } from "express";
import * as service from "./customers.service";

/**
 * Customers Controller
 * --------------------
 * Keep this layer thin: parse/normalize inputs, call service, return JSON.
 * Any validation/transforms that aren't HTTP-specific should live in the service.
 */

/**
 * GET /api/customers
 * Filters:
 *  - q: fuzzy search over name/email/phone/postcode
 *  - has: "email" | "phone" | "both" | "none"
 *  - channel: exact match on acquisition channel
 *  - min_satisfaction: number (>=)
 *  - limit: number (default 200, max 500)
 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    // NOTE: Query params arrive as strings; normalize here so the service can assume types.
    const q = (req.query.q as string | undefined)?.trim() || undefined;
    const has = (req.query.has as "email" | "phone" | "both" | "none" | undefined) || undefined;
    const channel = (req.query.channel as string | undefined) || undefined;

    // Convert min_satisfaction only if present (empty string → undefined).
    const min_satisfaction_raw = req.query.min_satisfaction as string | undefined;
    const min_satisfaction =
      min_satisfaction_raw != null && min_satisfaction_raw !== ""
        ? Number(min_satisfaction_raw)
        : undefined;

    // Clamp limit to [1, 500]; default to 200 if missing/invalid.
    const limitRaw = req.query.limit as string | undefined;
    const limit = Math.min(
      500,
      Math.max(1, Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 200)
    );

    const rows = await service.searchCustomers({
      q,
      has,
      channel,
      min_satisfaction,
      limit,
    });

    // FE currently expects { rows } shape; avoids ambiguity vs raw array.
    res.json({ rows });
  } catch (err) {
    // TODO: consider mapping known errors (validation/db) to 4xx here.
    next(err);
  }
}

/**
 * GET /api/customers/:id
 * Fetch a single customer by id.
 */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id); // keep as string; DB layer handles UUID validation.
    const row = await service.getCustomerById(id);

    if (!row) {
      // Consistent 404 contract for missing resource.
      return res.status(404).json({ error: "Not Found" });
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
}
