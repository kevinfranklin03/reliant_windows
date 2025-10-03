import { pool } from '../../db';
// src/modules/quotes/pricing.service.ts
import type {
  PredictQuoteCostsInput,
  PredictQuoteCostsOutput,
} from "./pricing.model";
import { buildFeatures, predictBase } from "../../services/model.runtime";

/**
 * Small helpers
 * -------------
 * Keep math tiny/boring here; heavy logic stays in dedicated fns.
 */

// round to 2dp (no locale stuff here)
function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/**
 * Rule-of-thumb breakdown used in both the ONNX feature prep and final return.
 * This is intentionally simple so it’s easy to reason about and tune.
 */
function roughRuleTotals(inp: PredictQuoteCostsInput) {
  const qtySum = (inp.items ?? []).reduce((a, r) => a + Number(r.quantity || 0), 0);

  // quick proxies for material & labour
  const mat = qtySum * 25;
  const labourFactor = inp.service_type === "supply_and_install" ? 85 : 35;
  const lab = (inp.items?.length || 0) * labourFactor;

  // generic overheads
  const over = (mat + lab) * 0.12;

  // timeline premium/discount (applied only to mat+lab portion)
  const timeMul =
    inp.timeframe === "asap" ? 1.15 : inp.timeframe === "3_6_months" ? 1.0 : 0.95;
  const timeCost = (mat + lab) * (timeMul - 1);

  // crude transport proxy: if postcode present, charge something
  const transport = inp.site_postcode?.trim() ? 35 : 0;

  // small fixed service fee for now
  const svcFee = 15;

  return { qtySum, mat, lab, over, timeCost, transport, svcFee };
}

/**
 * Try to get a base cost from the ONNX runtime.
 * We build a tiny feature vector, then defer to predictBase().
 * Returns null if the runtime can’t predict.
 */
async function predictBaseCostONNX(inp: PredictQuoteCostsInput): Promise<number | null> {
  const { qtySum } = roughRuleTotals(inp);

  // NOTE: buildFeatures() should stabilize shapes/dtypes for the ONNX model.
  const features = buildFeatures({
    qty_sum: qtySum,
    items_len: inp.items?.length || 0,
    is_install: inp.service_type === "supply_and_install" ? 1 : 0,
    timeframe_asap: inp.timeframe === "asap" ? 1 : 0,
    timeframe_3_6: inp.timeframe === "3_6_months" ? 1 : 0,
    timeframe_6_12: inp.timeframe === "6_12_months" ? 1 : 0,
    ch_website: inp.channel === "website" ? 1 : 0,
    ch_phone:   inp.channel === "phone"   ? 1 : 0,
    ch_social:  inp.channel === "social"  ? 1 : 0,
    ch_showroom:inp.channel === "showroom"? 1 : 0,
    ch_whatsapp:inp.channel === "whatsapp"? 1 : 0,
  });

  const base = await predictBase(features.tensor);
  return typeof base === "number" ? base : null;
}

/**
 * Lightweight heuristic if ONNX is down/unavailable.
 * Keep this conservative—model should beat this most of the time.
 */
function fallbackBaseHeuristic(inp: PredictQuoteCostsInput): number {
  const qty = (inp.items ?? []).reduce((a, r) => a + Number(r.quantity || 0), 0);
  const itemsLen = inp.items?.length || 0;
  const installBump = inp.service_type === "supply_and_install" ? 1.2 : 1.0;
  const tMul = inp.timeframe === "asap" ? 1.1 : inp.timeframe === "6_12_months" ? 0.95 : 1.0;

  return 40 + qty * 18 + itemsLen * 9 * installBump * tMul;
}

/**
 * Public: estimate costs for a quote using hybrid approach.
 * 1) compute simple rule totals
 * 2) try ONNX for base; fall back to heuristic
 * 3) assemble final predictable structure for the UI
 */
export async function predictQuoteCosts(
  inp: PredictQuoteCostsInput
): Promise<PredictQuoteCostsOutput> {
  const { mat, lab, over, timeCost, transport, svcFee } = roughRuleTotals(inp);

  // Try ONNX first; otherwise use heuristic
  let basePred = await predictBaseCostONNX(inp);
  if (basePred == null) {
    basePred = fallbackBaseHeuristic(inp);
  }

  // AI predicted *total* net (base + rule components)
  const ai_pred_cost = round2(basePred + mat + lab + over);

  return {
    base_cost: round2(basePred),
    material_cost: round2(mat),
    labour_cost: round2(lab),
    overhead_cost: round2(over),
    timeline_cost: round2(timeCost),
    transport_cost: round2(transport),
    service_fee: round2(svcFee),
    ai_pred_cost,
    vat_percent: 20,
    suggested_discount_pct: 0, // TODO: consider small loyalty tiers (0/5/10)
    reason:
      basePred != null
        ? "Combined rule-based costs + ONNX model-estimated base."
        : "Rule-based estimate (ONNX runtime not available).",
  };
}

/**
 * Types for full-price computation flow (non-ONNX).
 * These drive the DB lookups (BOM, labour rates, delivery zones).
 */
export type QuoteItemInput = {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom: string;
  quantity: number;
  width_mm?: number;
  height_mm?: number;
  color?: string;
  glazing?: string;
  lock_option?: string;
  is_bespoke?: boolean;
};

export type QuoteInput = {
  customer_id: string;
  service_type: 'supply_only'|'supply_and_install';
  timeframe: 'asap'|'3_6_months'|'6_12_months';
  channel?: string|null;
  site_postcode?: string|null;
  issued_by?: string|null;
  approved_by?: string|null;
  notes?: string|null;
  delivery_zone_id?: number|null;
  distance_km?: number|null;
  items: QuoteItemInput[];
};

/**
 * Full deterministic pricing path (no ONNX).
 * Pulls BOM/material prices, labour rates, urgency multipliers, delivery fees, etc.
 * Returns a header summary + per-item estimates.
 */
export async function priceQuote(input: QuoteInput) {
  // Load policy/knobs from DB (urgency, VAT, overhead)
  const urgency = await getUrgencyMult(input.timeframe);
  const vatPercent = await getLatestPercent('vat_rates');
  const overheadPercent = await getLatestPercent('overhead_rates');

  let material_cost = 0;
  let labour_cost = 0;
  let service_fee = 0;
  let transport_cost = 0;

  const itemsOut: any[] = [];

  for (const li of input.items) {
    let est_material = 0;

    // If we have a product, compute material via BOM x latest unit_cost per UOM
    if (li.product_id) {
      const { rows } = await pool.query(`
        SELECT COALESCE(SUM(b.qty_per_uom * mph.unit_cost),0) AS cost_per_uom
        FROM bill_of_materials b
        JOIN LATERAL (
          SELECT unit_cost FROM material_price_history
          WHERE material_id = b.material_id
          ORDER BY effective_from DESC LIMIT 1
        ) mph ON TRUE
        WHERE b.product_id = $1
      `, [li.product_id]);

      const costPerUom = Number(rows[0]?.cost_per_uom || 0);
      est_material = costPerUom * li.quantity;
    }

    // Labour via service_products default_hours × latest labour rate × urgency multiplier
    let est_labour = 0;

    if (li.product_id) {
      const sp = await pool.query(`
        SELECT sp.default_hours, COALESCE(sp.rate_override, lr.hourly_rate) AS rate
        FROM service_products sp
        JOIN services s ON s.id = sp.service_id AND s.name='Installation'
        LEFT JOIN labour_roles r ON r.role_name='fitter'
        LEFT JOIN LATERAL (
          SELECT hourly_rate FROM labour_rates WHERE role_id = r.id
          ORDER BY effective_from DESC LIMIT 1
        ) lr ON TRUE
        WHERE sp.product_id = $1
        LIMIT 1
      `, [li.product_id]);

      if (sp.rows.length) {
        const hours = Number(sp.rows[0].default_hours || 0) * li.quantity;
        const rate  = Number(sp.rows[0].rate || 0);
        est_labour = hours * rate * urgency.labour_mult;
      }

    } else if (li.service_id) {
      // Service-only line: use service base_rate (per_hour or fixed fee)
      const s = await pool.query(
        `SELECT pricing_model, base_rate FROM services WHERE id=$1`,
        [li.service_id]
      );
      if (s.rows.length) {
        const pm = s.rows[0].pricing_model as string;
        const base = Number(s.rows[0].base_rate || 0);
        if (pm === 'per_hour') {
          est_labour = base * li.quantity * urgency.labour_mult;
        } else {
          // fixed service fee line
          service_fee += base;
        }
      }
    }

    const est_overheads = (est_material + est_labour) * (overheadPercent / 100);

    itemsOut.push({
      ...li,
      est_material_cost: round(est_material),
      est_labour_cost: round(est_labour),
      est_overheads: round(est_overheads),
      unit_price_net: 0,     // left for manual/AI suggestion in UI
      discount_pct: 0,       // ditto
      line_net_total: round(est_material + est_labour + est_overheads),
    });

    material_cost += est_material;
    labour_cost += est_labour;
  }

  // Delivery: fixed + per-km if we have a zone + distance
  if (input.delivery_zone_id) {
    const d = await pool.query(
      `SELECT fixed_fee, per_km_fee FROM delivery_zones WHERE id=$1`,
      [input.delivery_zone_id]
    );
    if (d.rows.length) {
      const fixed = Number(d.rows[0].fixed_fee || 0);
      const perKm = Number(d.rows[0].per_km_fee || 0);
      transport_cost = fixed + perKm * Number(input.distance_km || 0);
    }
  }

  // Overheads as % of (materials + labour). Timeline already baked into labour via urgency.
  const overhead_cost = (material_cost + labour_cost) * (overheadPercent / 100);
  const timeline_cost = 0; // already applied in labour via urgency multiplier
  const base_cost = 0;     // not used in this deterministic path

  const total_net = material_cost + labour_cost + overhead_cost + timeline_cost + transport_cost + service_fee;
  const vat_amount = total_net * (vatPercent / 100);
  const total_gross = total_net + vat_amount;

  return {
    header: {
      base_cost: round(base_cost),
      material_cost: round(material_cost),
      labour_cost: round(labour_cost),
      overhead_cost: round(overhead_cost),
      timeline_cost: round(timeline_cost),
      transport_cost: round(transport_cost),
      service_fee: round(service_fee),
      vat_percent: vatPercent,
      vat_amount: round(vat_amount),
      total_net: round(total_net),
      total_gross: round(total_gross),
    },
    items: itemsOut,
  };
}

/** plain round helper (EPSILON to avoid .005 issues) */
function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/**
 * Fetch urgency multipliers for labour/margins (per timeframe).
 * If missing in DB, we default to neutral (1.0/1.0).
 */
async function getUrgencyMult(tf: 'asap'|'3_6_months'|'6_12_months') {
  const { rows } = await pool.query(
    `SELECT labour_mult, margin_mult FROM urgency_multipliers WHERE timeframe=$1`, [tf]
  );
  if (!rows.length) return { labour_mult: 1.0, margin_mult: 1.0 };
  return { labour_mult: Number(rows[0].labour_mult || 1), margin_mult: Number(rows[0].margin_mult || 1) };
}

/**
 * Grab the latest percent value from a policy table.
 * NOTE: Table name is interpolated—keep this param strictly typed/whitelisted.
 * (Runtime validation recommended if this ever goes dynamic.)
 */
async function getLatestPercent(table: 'vat_rates'|'overhead_rates') {
  const { rows } = await pool.query(
    `SELECT percent FROM ${table} ORDER BY effective_from DESC LIMIT 1`
  );
  return rows.length ? Number(rows[0].percent || 0) : 0;
}
