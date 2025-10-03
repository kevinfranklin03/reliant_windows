// src/modules/quotes/quotes.controller.ts
import type { Request, Response } from "express";
import * as Svc from "./quotes.service";
import * as PricingService from "./pricing.service";

/**
 * POST /api/ai-suggest-price
 * Thin wrapper around PricingService.predictQuoteCosts.
 * Validates minimal fields; the service handles the rest.
 */
export async function aiSuggestPrice(req: Request, res: Response) {
  try {
    const { customer_id, service_type, timeframe, channel, site_postcode, items } = req.body ?? {};

    // Simple guard for required fields (keep this fast + explicit).
    if (!service_type || !timeframe || !channel) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["service_type", "timeframe", "channel"],
        received: { items_len: Array.isArray(items) ? items.length : 0 },
      });
    }

    // Delegate to pricing service (handles ONNX/fallback + rule-based bits).
    const result = await PricingService.predictQuoteCosts({
      customer_id,
      service_type,
      timeframe,
      channel,
      site_postcode,
      items: Array.isArray(items) ? items : [],
    });

    // Shape the response for the UI. Keep defaults so FE logic is predictable.
    return res.json({
      base_cost: result.base_cost ?? 0,
      material_cost: result.material_cost ?? 0,
      labour_cost: result.labour_cost ?? 0,
      overhead_cost: result.overhead_cost ?? 0,
      timeline_cost: result.timeline_cost ?? 0,
      transport_cost: result.transport_cost ?? 0,
      service_fee: result.service_fee ?? 0,
      ai_pred_cost: result.ai_pred_cost ?? null,
      vat_percent: result.vat_percent ?? 20,
      suggested_discount_pct: result.suggested_discount_pct ?? 0,
      reason: result.reason ?? "AI prediction based on historical patterns and similar quotes.",
    });
  } catch (e: any) {
    // Keep logs noisy here; this is called from the UI frequently during edits.
    console.error("aiSuggestPrice error:", e);
    return res.status(500).json({ error: e?.message || "Internal Server Error" });
  }
}

// UUID sanity check (keep it local, avoids pulling a helper).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Allowed status transitions are enforced in service/db; here we just gate input shape.
const ALLOWED = [
  "draft",
  "issued",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;

type AllowedStatus = (typeof ALLOWED)[number];

/**
 * GET /api/quotes
 * Filters: status, customer_q (free text), from/to (ISO-ish), limit.
 * TODO: add pagination meta if/when FE needs infinite scroll.
 */
export async function list(req: Request, res: Response) {
  const { status, customer_q, from, to, limit } = req.query;
  try {
    const rows = await Svc.list({
      status:
        typeof status === "string" && (ALLOWED as readonly string[]).includes(status)
          ? (status as AllowedStatus)
          : undefined,
      customer_q: typeof customer_q === "string" ? customer_q : undefined,
      from: typeof from === "string" ? from : undefined,
      to: typeof to === "string" ? to : undefined,
      limit: limit ? Number(limit) : 500, // service can clamp if needed
    });

    return res.json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to list quotes" });
  }
}

/**
 * GET /api/quotes/:id
 * Basic 400/404 handling for better FE messages.
 */
export async function getById(req: Request, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Invalid quote id" });
  }

  try {
    const quote = await Svc.getById(id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    return res.json(quote);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch quote" });
  }
}

/**
 * PATCH /api/quotes/:id
 * Allowed fields: status, timeframe, service_type, notes
 * NOTE: We only accept these keys; everything else is ignored silently.
 */
export async function update(req: Request, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Invalid quote id" });
  }

  const allowedFields = ["status", "timeframe", "service_type", "notes"] as const;
  const patch: Record<string, any> = {};
  for (const k of allowedFields) {
    if (k in req.body) patch[k] = (req.body as any)[k];
  }

  // Quick status whitelist check (service still validates transitions).
  if (patch.status && !(ALLOWED as readonly string[]).includes(patch.status)) {
    return res.status(400).json({ error: "Invalid status", allowed: ALLOWED });
  }

  try {
    const updated = await Svc.update(id, patch);
    return res.json(updated);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to update quote" });
  }
}

/**
 * PATCH /api/quotes/:id/status
 * Body: { status: "accepted" | ... }
 * Small sugar: we map "approved" → "accepted" for UI consistency.
 */
export async function updateStatus(req: Request, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Invalid quote id" });
  }

  let { status } = (req.body || {}) as { status?: string };

  if (!status) {
    return res.status(400).json({ error: "status is required", allowed: ALLOWED });
  }

  // UI sometimes calls this "approved"; normalize here.
  if (status === "approved") status = "accepted";

  if (!(ALLOWED as readonly string[]).includes(status)) {
    return res.status(400).json({ error: "Invalid status", allowed: ALLOWED });
  }

  try {
    const updated = await Svc.updateStatus(id, status);
    return res.json(updated);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to update status" });
  }
}

/**
 * DELETE /api/quotes/:id
 * Returns { ok: true } for clarity (or 204 if you prefer no body).
 */
export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "Invalid quote id" });
  }

  try {
    await Svc.remove(id);
    return res.json({ ok: true });
    // Alternative: return res.status(204).end();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to delete quote" });
  }
}

/**
 * POST /api/quotes
 * Creates a quote header row from provided fields.
 * NOTE: Items are not handled here; this endpoint stores header/costs only.
 */
export async function createQuote(req: Request, res: Response) {
  try {
    const b = req.body ?? {};
    const missing = ["customer_id", "service_type", "timeframe"].filter((k) => !b[k]);
    if (missing.length) {
      return res.status(400).json({ error: "Missing required fields", missing });
    }

    // Pass through cost fields as provided (UI can use AI suggest + manual edits).
    const id = await Svc.insertQuote({
      customer_id: b.customer_id,
      service_type: b.service_type,   // 'supply_only' | 'supply_and_install'
      timeframe: b.timeframe,
      channel: b.channel ?? null,
      site_postcode: b.site_postcode ?? null,
      notes: b.notes ?? null,

      base_cost: b.base_cost ?? 0,
      material_cost: b.material_cost ?? 0,
      labour_cost: b.labour_cost ?? 0,
      overhead_cost: b.overhead_cost ?? 0,
      timeline_cost: b.timeline_cost ?? 0,
      transport_cost: b.transport_cost ?? 0,
      service_fee: b.service_fee ?? 0,
      ai_pred_cost: b.ai_pred_cost ?? null,
      discount_pct: b.discount_pct ?? 0,
      vat_percent: b.vat_percent ?? 20,
    });

    // Return full resource for convenience (saves a follow-up GET on FE).
    const full = await Svc.getById(id);
    return res.status(201).json(full ?? { id });
  } catch (e: any) {
    console.error("[quotes] createQuote:", e);
    return res.status(500).json({ error: e?.message || "Internal Server Error" });
  }
}
