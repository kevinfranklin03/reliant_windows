// src/modules/quotes/quotes.service.ts
import { db, pool } from "../../db";
import {
  aiSuggestCosts,
  AiSuggestResult,
  AiSuggestInput,
} from "./pricing.model";

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
  // Keep args positional to match the SQL above.
  const args = [
    q.customer_id,
    q.service_type, // must be enum value
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

/**
 * Full quote creator (header + items) in a single TX.
 * - Validates FK to customers up front.
 * - Explicit enum casts on header insert to avoid search_path weirdness.
 * - Inserts items if provided.
 */
export async function createQuote(input: CreateQuoteInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock to public schema for this TX to avoid accidental shadow schema writes.
    await client.query(`SET LOCAL search_path TO public`);

    const db = await client.query("select current_database() db, current_user usr");
    console.log(`[quotes] DB=${db.rows[0]?.db} USER=${db.rows[0]?.usr}`);

    // Validate FK early (clear message when customer is missing).
    const ck = await client.query(
      `SELECT 1 FROM public.customers WHERE id = $1`,
      [input.customer_id]
    );
    if (!ck.rowCount) {
      throw new Error(`customer_id not found: ${input.customer_id}`);
    }

    const status = "draft"; // enum public.quote_status

    // Header insert with explicit enum casts.
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
      input.service_type,         // must match enum label exactly
      input.timeframe,            // must match enum label exactly
      input.channel ?? null,      // nullable enum
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
    if (headerRes.rowCount !== 1) {
      throw new Error("Failed to insert quote header");
    }
    const quoteId: string = headerRes.rows[0].id;

    // Items insert (if any). Fails hard → rollback (as intended).
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
        if (r.rowCount !== 1) {
          throw new Error("Failed to insert a quote item");
        }
        insertedItems++;
      }
    }

    // Sanity check before commit.
    const verify = await client.query(
      `SELECT 1 FROM public.quotes WHERE id = $1`,
      [quoteId]
    );
    if (!verify.rowCount) {
      throw new Error("Verification failed: header row not found after insert");
    }

    await client.query("COMMIT");
    console.log(`[quotes] created id=${quoteId} items=${insertedItems}`);
    return { id: quoteId, status, inserted_items: insertedItems };
  } catch (err: any) {
    await client.query("ROLLBACK");
    // Log PG diagnostic bits when available (super helpful).
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
  // NOTE: Keep selected columns minimal for speed.
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

type PredictPayload = {
  customer_id?: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  channel: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  site_postcode?: string;
  items: { product_id?: string; service_id?: string; description?: string; uom?: string; quantity: number }[];
};

/**
 * Orchestrates AI pricing:
 * - loads a tiny customer profile (satisfaction/loyalty)
 * - normalizes channel
 * - calls aiSuggestCosts (which blends rule + model residual)
 */
export async function aiSuggestPriceService(payload: PredictPayload): Promise<AiSuggestResult> {
  const cust = await getCustomerLite(payload.customer_id);

  const input: AiSuggestInput = {
    customer: cust
      ? {
          id: cust.id,
          satisfaction: cust.satisfaction ?? undefined,
          total_purchases: cust.total_purchases ?? undefined,
          postcode: cust.postcode ?? undefined,
          channel: toChannel(cust.interaction_channel)
        }
      : null,
    service_type: payload.service_type,
    timeframe: payload.timeframe,
    channel: payload.channel,
    site_postcode: payload.site_postcode,
    items: payload.items || [],
  };

  return aiSuggestCosts(input);
}

/* ------------------------------ queries --------------------------------- */

type ListParams = {
  status?: 'draft'|'issued'|'accepted'|'declined'|'expired'|'converted';
  customer_q?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  limit?: number;
};

/**
 * List quotes with a few common filters.
 * NOTE: Returns a plain array; add pagination meta later if needed.
 */
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
  // TIP: Index q.created_at DESC, q.status, and a trigram/GIN on c.name if search gets heavy.
  const r = await pool.query(sql, vals);
  return r.rows ?? [];
}

/**
 * Get a single quote (header + items).
 * Shape totals as numbers, attach items sorted by creation order.
 */
export async function getById(id: string) {
  const qSql = `
    SELECT q.*, jsonb_build_object('name', c.name) AS customer
    FROM quotes q
    LEFT JOIN customers c ON c.id = q.customer_id
    WHERE q.id = $1
    LIMIT 1;
  `;
  const qr = await pool.query(qSql, [id]);
  const quote = qr.rows?.[0];
  if (!quote) return null;

  const itemsSql = `
    SELECT
      qi.id,
      qi.quote_id,
      qi.product_id,
      qi.service_id,
      COALESCE(qi.description, p.name, s.name) AS description,
      qi.uom,
      qi.quantity,
      qi.width_mm,
      qi.height_mm,
      qi.color,
      qi.glazing,
      qi.lock_option,
      qi.is_bespoke,
      qi.est_material_cost,
      qi.est_labour_cost,
      qi.est_overheads,
      qi.unit_price_net,
      qi.discount_pct,
      qi.line_net_total,
      qi.created_at,
      p.name AS product_name,
      s.name AS service_name,
      ROW_NUMBER() OVER (
        PARTITION BY qi.quote_id
        ORDER BY qi.created_at, qi.id
      ) AS line_no
    FROM public.quote_items qi
    LEFT JOIN public.products p ON p.id = qi.product_id
    LEFT JOIN public.services s ON s.id = qi.service_id
    WHERE qi.quote_id = $1
    ORDER BY qi.created_at, qi.id;
  `;

  const ir = await pool.query(itemsSql, [id]);
  quote.items = ir.rows ?? [];

  // number-ify totals for FE (avoid "123.45" strings).
  const num = (v: any) => (v == null ? 0 : Number(v));
  quote.total_net   = num(quote.total_net);
  quote.vat_amount  = num(quote.vat_amount);
  quote.total_gross = num(quote.total_gross);

  return quote;
}

/**
 * Patch a quote header. Unknown keys are ignored at controller level,
 * but we still update whatever arrives in `patch` here.
 * Returns the refreshed quote.
 */
export async function update(id: string, patch: Record<string, any>) {
  if (!Object.keys(patch).length) return await getById(id);

  const cols: string[] = [];
  const vals: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = $${i++}`);
    vals.push(v);
  }
  vals.push(id);

  const sql = `UPDATE quotes SET ${cols.join(', ')} WHERE id = $${i} RETURNING id;`;
  const r = await pool.query(sql, vals);
  const targetId = r.rows?.[0]?.id || id;
  return await getById(targetId);
}

/**
 * Update only the status (tiny helper used by controller).
 */
export async function updateStatus(id: string, status: string) {
  const r = await pool.query(
    `UPDATE quotes SET status = $1 WHERE id = $2 RETURNING id;`,
    [status, id]
  );
  if (!r || !r.rows || (r.rowCount ?? 0) === 0) {
    throw new Error('Quote not found or not updated');
  }
  return await getById(id);
}

/**
 * Hard delete a quote + its items.
 * NOTE: UI currently uses "declined" instead of delete; this is optional.
 */
export async function remove(id: string) {
  await pool.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
  await pool.query('DELETE FROM quotes WHERE id = $1', [id]);
}
