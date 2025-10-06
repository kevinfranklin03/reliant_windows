// src/modules/quotes/quotes.service.ts
import { db, pool } from "../../db";
import {
  aiSuggestCosts,
  AiSuggestResult,
  AiSuggestInput,
} from "./pricing.model";

/* ------------------------------------------------------------------ */
/*                        INSERT BARE QUOTE HEADER                     */
/* ------------------------------------------------------------------ */
/**
 * Insert a bare quote header.
 * NOTE: This does NOT insert items; it stores header + cost totals only.
 * Caller should pass already-computed costs (manual/AI suggested).
 */
export async function insertQuote(q: any): Promise<string> {
  const sql = `
    INSERT INTO public.quotes (
      customer_id, status, service_type, timeframe, channel,
      site_postcode, issued_by, approved_by, notes,
      base_cost, material_cost, labour_cost, overhead_cost,
      timeline_cost, transport_cost, service_fee,
      ai_pred_cost, discount_pct, vat_percent, vat_amount,
      total_net, total_gross, created_at
    )
    VALUES (
      $1, 'draft', $2, $3, $4,
      $5, NULL, NULL, $6,
      $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16, 0,
      0, 0, now()
    )
    RETURNING id
  `;
  const args = [
    q.customer_id,
    q.service_type, // enum
    q.timeframe,
    q.channel,
    q.site_postcode,
    q.notes,
    q.base_cost || 0,
    q.material_cost || 0,
    q.labour_cost || 0,
    q.overhead_cost || 0,
    q.timeline_cost || 0,
    q.transport_cost || 0,
    q.service_fee || 0,
    q.ai_pred_cost ?? null,
    q.discount_pct || 0,
    q.vat_percent ?? 20,
  ];

  const { rows } = await pool.query(sql, args);
  return rows[0].id as string;
}

/* ------------------------------- Types ---------------------------------- */
// Kept local to this module (mirrors controller-facing shapes when needed).

type QuoteItemInput = {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: string;
  quantity: number;
  width_mm?: number;
  height_mm?: number;
  color?: string;
  glazing?: string;
  lock_option?: string;
  is_bespoke?: boolean;
};

type CreateQuoteInput = {
  customer_id: string;
  service_type: "supply_only" | "supply_and_install";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  channel?: "website" | "phone" | "social" | "showroom" | "whatsapp" | null;
  site_postcode?: string | null;
  issued_by?: string | null;
  approved_by?: string | null;
  notes?: string | null;

  base_cost?: number;
  material_cost?: number;
  labour_cost?: number;
  overhead_cost?: number;
  timeline_cost?: number;
  transport_cost?: number;
  service_fee?: number;
  ai_pred_cost?: number | null;
  discount_pct?: number;
  vat_percent?: number;
  vat_amount?: number;
  total_net?: number;
  total_gross?: number;

  items: QuoteItemInput[];
};

/* ------------------------------------------------------------------ */
/*                           CREATE QUOTE TX                          */
/* ------------------------------------------------------------------ */
export async function createQuote(input: CreateQuoteInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO public`);

    const dbi = await client.query("select current_database() db, current_user usr");
    console.log(`[quotes] DB=${dbi.rows[0]?.db} USER=${dbi.rows[0]?.usr}`);

    // Validate FK early.
    const ck = await client.query(
      `SELECT 1 FROM public.customers WHERE id = $1`,
      [input.customer_id]
    );
    if (!ck.rowCount) {
      throw new Error(`customer_id not found: ${input.customer_id}`);
    }

    const status = "draft"; // enum public.quote_status

    const insertHeaderSQL = `
      INSERT INTO public.quotes (
        customer_id, status, service_type, timeframe, channel,
        site_postcode, issued_by, approved_by, notes,
        base_cost, material_cost, labour_cost, overhead_cost, timeline_cost,
        transport_cost, service_fee, ai_pred_cost, discount_pct, vat_percent,
        vat_amount, total_net, total_gross
      )
      VALUES (
        $1,
        ($2)::public.quote_status,
        ($3)::public.service_type,
        ($4)::public.timeframe,
        ($5)::public.channel,
        $6,$7,$8,$9,
        $10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,
        $20,$21,$22
      )
      RETURNING id
    `;

    const headerVals = [
      input.customer_id,
      status,
      input.service_type,
      input.timeframe,
      input.channel ?? null,
      input.site_postcode ?? null,
      input.issued_by ?? null,
      input.approved_by ?? null,
      input.notes ?? null,
      input.base_cost ?? 0,
      input.material_cost ?? 0,
      input.labour_cost ?? 0,
      input.overhead_cost ?? 0,
      input.timeline_cost ?? 0,
      input.transport_cost ?? 0,
      input.service_fee ?? 0,
      input.ai_pred_cost ?? null,
      input.discount_pct ?? 0,
      input.vat_percent ?? 20,
      input.vat_amount ?? 0,
      input.total_net ?? 0,
      input.total_gross ?? 0,
    ];

    const headerRes = await client.query(insertHeaderSQL, headerVals);
    if (headerRes.rowCount !== 1) throw new Error("Failed to insert quote header");
    const quoteId: string = headerRes.rows[0].id;

    // Items
    let insertedItems = 0;
    if (Array.isArray(input.items) && input.items.length) {
      const insertItemSQL = `
        INSERT INTO public.quote_items (
          quote_id, product_id, service_id, description, uom, quantity,
          width_mm, height_mm, color, glazing, lock_option, is_bespoke
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `;
      for (const li of input.items) {
        const vals = [
          quoteId,
          li.product_id ?? null,
          li.service_id ?? null,
          li.description ?? null,
          li.uom ?? null,
          Number(li.quantity || 0),
          li.width_mm ?? null,
          li.height_mm ?? null,
          li.color ?? null,
          li.glazing ?? null,
          li.lock_option ?? null,
          typeof li.is_bespoke === "boolean" ? li.is_bespoke : null,
        ];
        const r = await client.query(insertItemSQL, vals);
        if (r.rowCount !== 1) throw new Error("Failed to insert a quote item");
        insertedItems++;
      }
    }

    const verify = await client.query(
      `SELECT 1 FROM public.quotes WHERE id = $1`,
      [quoteId]
    );
    if (!verify.rowCount) throw new Error("Verification failed: header row not found after insert");

    await client.query("COMMIT");
    console.log(`[quotes] created id=${quoteId} items=${insertedItems}`);
    return { id: quoteId, status, inserted_items: insertedItems };
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err?.code) {
      console.error("[quotes] PG error:", {
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
        schema: err.schema,
        table: err.table,
        column: err.column,
      });
    }
    console.error("[quotes] createQuote TX rollback:", err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------- helpers & local types ------------------------- */

// Whitelist of channels (matches enum on DB side).
const allowedChannels = [
  "website",
  "phone",
  "whatsapp",
  "referral",
  "social",
  "showroom",
  "email",
] as const;

type Channel = (typeof allowedChannels)[number];

// Normalize a string to a known channel (undefined if unknown).
function toChannel(x?: string | null): Channel | undefined {
  if (!x) return undefined;
  const v = String(x).toLowerCase();
  return (allowedChannels as readonly string[]).includes(v)
    ? (v as Channel)
    : undefined;
}

// Small customer slice for AI pricing (avoid heavy joins).
async function getCustomerLite(customer_id?: string | null) {
  if (!customer_id) return null;
  return db.oneOrNone<{
    id: string;
    satisfaction: number | null;
    total_purchases: number | null;
    postcode: string | null;
    interaction_channel: string | null;
  }>(
    `SELECT id, satisfaction, total_purchases, postcode, interaction_channel
     FROM customers
     WHERE id = $1`,
    [customer_id]
  );
}

/* ----------------------- AI Suggest: unified paths ---------------------- */

type PredictPayload = {
  customer_id?: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  channel: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  site_postcode?: string;
  items: { product_id?: string; service_id?: string; description?: string; uom?: string; quantity: number }[];
};

// COST-BASED payload type (frontend may send this instead of items)
export type CostSuggestPayload = {
  base_cost?: number;
  material_cost?: number;
  labour_cost?: number;
  overhead_cost?: number;
  timeline_cost?: number;
  transport_cost?: number;
  service_fee?: number;
  discount?: number;   // absolute
  vat_rate?: number;   // 0..1
};

export type CostSuggestResponse = {
  ok: true;
  suggestion: { net: number; gross: number; vat_rate: number; uplift: number };
  reason: string;

  // echo fields expected by FE
  base_cost: number;
  material_cost: number;
  labour_cost: number;
  overhead_cost: number;
  timeline_cost: number;
  transport_cost: number;
  service_fee: number;
  ai_pred_cost: number;  // == uplift
  vat_percent: number;   // 0..100
  suggested_discount_pct?: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Pure: take cost inputs, compute uplift & totals, return UI-friendly shape */
export function aiSuggestFromCosts(payload: CostSuggestPayload): CostSuggestResponse {
  const base_cost       = Number(payload.base_cost ?? 0);
  const material_cost   = Number(payload.material_cost ?? 0);
  const labour_cost     = Number(payload.labour_cost ?? 0);
  const overhead_cost   = Number(payload.overhead_cost ?? 0);
  const timeline_cost   = Number(payload.timeline_cost ?? 0);
  const transport_cost  = Number(payload.transport_cost ?? 0);
  const service_fee     = Number(payload.service_fee ?? 0);
  const discountAbs     = Math.max(0, Number(payload.discount ?? 0));
  const vat_rate        = Math.max(0, Number(payload.vat_rate ?? 0)); // 0..1

  const subtotal = base_cost + material_cost + labour_cost + overhead_cost + timeline_cost + transport_cost + service_fee;
  const net_before_uplift = Math.max(0, subtotal - discountAbs);

  // Heuristic: ~12% uplift, clamped to 0..25%
  const upliftPct = Math.max(0, Math.min(0.25, 0.12));
  const uplift    = r2(subtotal * upliftPct);

  const suggested_net   = r2(net_before_uplift + uplift);
  const suggested_gross = r2(suggested_net * (1 + vat_rate));

  return {
    ok: true,
    suggestion: { net: suggested_net, gross: suggested_gross, vat_rate, uplift },
    reason:
      "Baseline = sum of costs minus discount; uplift ≈ 12% of subtotal (capped at 25%) to cover risk/margin.",
    base_cost: r2(base_cost),
    material_cost: r2(material_cost),
    labour_cost: r2(labour_cost),
    overhead_cost: r2(overhead_cost),
    timeline_cost: r2(timeline_cost),
    transport_cost: r2(transport_cost),
    service_fee: r2(service_fee),
    ai_pred_cost: uplift,
    vat_percent: r2(vat_rate * 100),
  };
}

/**
 * Orchestrates AI pricing:
 * - If body has cost fields, compute from costs (aiSuggestFromCosts)
 * - Else if body has items, call model path (aiSuggestCosts) and normalize
 */
export async function aiSuggestPriceService(payload: any): Promise<CostSuggestResponse> {
  // --- COST-BASED path ----------------------------------------------------
  if (
    payload &&
    (
      'base_cost' in payload || 'material_cost' in payload || 'labour_cost' in payload ||
      'overhead_cost' in payload || 'timeline_cost' in payload || 'transport_cost' in payload ||
      'service_fee' in payload
    )
  ) {
    return aiSuggestFromCosts(payload as CostSuggestPayload);
  }

  // --- ITEMS-BASED path (normalize AiSuggestResult -> FE envelope) --------
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  const cust = await getCustomerLite(payload?.customer_id);
  const input: AiSuggestInput = {
    customer: cust
      ? {
          id: cust.id,
          satisfaction: cust.satisfaction ?? undefined,
          total_purchases: cust.total_purchases ?? undefined,
          postcode: cust.postcode ?? undefined,
          channel: toChannel(cust.interaction_channel),
        }
      : null,
    service_type: payload?.service_type,
    timeframe: payload?.timeframe,
    channel: payload?.channel,
    site_postcode: payload?.site_postcode,
    items: payload?.items || [],
  };

  const out: AiSuggestResult = await aiSuggestCosts(input);

  // Derive subtotal from granular costs the model returns
  const subtotal =
    (out.base_cost ?? 0) +
    (out.material_cost ?? 0) +
    (out.labour_cost ?? 0) +
    (out.overhead_cost ?? 0) +
    (out.timeline_cost ?? 0) +
    (out.transport_cost ?? 0) +
    (out.service_fee ?? 0);

  const uplift  = Number(out.ai_pred_cost ?? 0);              // model's residual add-on
  const vatRate = Math.max(0, Number(out.vat_percent ?? 20) / 100); // convert % -> rate 0..1
  const net     = round2(subtotal + uplift);
  const gross   = round2(net * (1 + vatRate));

  return {
    ok: true,
    suggestion: {
      net,
      gross,
      vat_rate: vatRate,
      uplift: round2(uplift),
    },
    reason: out.reason ?? "Predicted from items, customer and channel context.",
    // echo the granular costs so the FE can populate fields directly
    base_cost:      round2(out.base_cost ?? 0),
    material_cost:  round2(out.material_cost ?? 0),
    labour_cost:    round2(out.labour_cost ?? 0),
    overhead_cost:  round2(out.overhead_cost ?? 0),
    timeline_cost:  round2(out.timeline_cost ?? 0),
    transport_cost: round2(out.transport_cost ?? 0),
    service_fee:    round2(out.service_fee ?? 0),
    ai_pred_cost:   round2(uplift),
    vat_percent:    round2(vatRate * 100), // FE expects percent here
    suggested_discount_pct: out.suggested_discount_pct,
  };
}


/* ------------------------------ queries --------------------------------- */

type ListParams = {
  status?: 'draft'|'issued'|'accepted'|'declined'|'expired'|'converted';
  customer_q?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  limit?: number;
};

export async function list(p: ListParams) {
  const where: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (p.status) { where.push(`q.status = $${i++}`); vals.push(p.status); }
  if (p.customer_q) {
    where.push(`(c.name ILIKE $${i} OR q.id::text ILIKE $${i})`);
    vals.push(`%${p.customer_q}%`); i++;
  }
  if (p.from) { where.push(`q.created_at >= $${i++}`); vals.push(p.from); }
  if (p.to)   { where.push(`q.created_at < ($${i++}::date + INTERVAL '1 day')`); vals.push(p.to); }

  const limit = Math.min(Math.max(p.limit ?? 500, 1), 2000);

  const sql = `
    SELECT q.*, jsonb_build_object('name', c.name) AS customer
    FROM quotes q
    LEFT JOIN customers c ON c.id = q.customer_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY q.created_at DESC
    LIMIT ${limit};
  `;
  const r = await pool.query(sql, vals);
  return r.rows ?? [];
}

export async function getById(id: string) {
  const qSql = `
    SELECT q.*, jsonb_build_object('name', c.name) AS customer
    FROM quotes q
    LEFT JOIN customers c ON c.id = q.customer_id
    WHERE q.id = $1
    LIMIT 1;
  `};
