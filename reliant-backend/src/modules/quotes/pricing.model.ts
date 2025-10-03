// src/services/ai/pricing.model.ts
import { predictResidual } from "../../services/model.runtime";

// src/modules/quotes/pricing.model.ts
export type Channel = "website" | "phone" | "social" | "showroom" | "whatsapp";
export type Timeframe = "asap" | "3_6_months" | "6_12_months";

export interface QuoteItem {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: string;
  quantity: number;
}

export interface PredictQuoteCostsInput {
  customer_id?: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: Timeframe;
  channel: Channel;
  site_postcode?: string;
  items: QuoteItem[];
}

export interface PredictQuoteCostsOutput {
  base_cost?: number;
  material_cost?: number;
  labour_cost?: number;
  overhead_cost?: number;
  timeline_cost?: number;
  transport_cost?: number;
  service_fee?: number;
  ai_pred_cost?: number | null;
  vat_percent?: number;
  suggested_discount_pct?: number;
  reason?: string;
}

/** ---------- Types ---------- */

export type QuoteItemInput = {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: string;
  quantity: number;
};

export type AiSuggestInput = {
  customer: null | {
    id: string;
    satisfaction?: number;
    total_purchases?: number;
    postcode?: string;
    channel?: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  };
  service_type: "supply_and_install" | "supply_only";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  channel: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  site_postcode?: string | null;
  items: QuoteItemInput[];
};

export type AiSuggestResult = {
  base_cost: number;
  material_cost: number;
  labour_cost: number;
  overhead_cost: number;
  timeline_cost: number;
  transport_cost: number;
  service_fee: number;
  ai_pred_cost: number;               // residual add-on (from model) in £
  vat_percent: number;                // UI default (using 20% here)
  suggested_discount_pct?: number;    // 0 | 5 | 10 (simple loyalty tiers)
  reason?: string;                    // quick human explanation for UI
};

/** ---------- Config / Coefficients (tweak freely) ----------
 * These are opinionated, not sacred. Adjust as real data arrives.
 * All numbers in £ except percentages/multipliers.
 */
const COEF = {
  // materials & labour baselines
  unitMaterial: 25,        // £ per "unit" proxy (rough quantity signal)
  labourPerLine: 35,       // £ per line item (setup / handling)
  baseCost: 40,            // fixed base (site visit / paperwork)
  overheadPct: 0.08,       // % of (materials+labour) for overheads
  serviceFeePct: 0.06,     // % of subtotal (pre-VAT) as margin

  // timeline / transport multipliers
  asapMult: 1.15,          // rush premium
  midMult: 1.05,           // 3–6 months
  longMult: 1.00,          // 6–12 months (no premium)
  transportPerArea: 18,    // £ per crude "ring" from postcode area

  // fallback AI uplift if model missing/unavailable
  aiUplift: 0.07,               // ~7% of baseline
  satisfactionAdjPerStar: 0.02, // +/- 2% per star away from 3
  loyaltyAddOn: 0.03,           // small extra if repeat customer

  // policy
  vatPercent: 20,
};

/** ---------- Helpers ----------
 * Keep these deterministic and tiny. No I/O.
 */

// round to 2dp, hard-stop guard for NaN/undefined
function r2(n: number) { return Math.round((Number(n) || 0) * 100) / 100; }

// pull a coarse area code from postcode (e.g. "B15 3AB" -> "B15")
function toArea(pc?: string | null): string {
  if (!pc) return "";
  const s = pc.trim().toUpperCase();
  const sp = s.split(/\s+/)[0];
  return sp || s.slice(0, 3);
}

// sum of quantities; falls back to 0 for weird inputs
function qtyFromItems(items: QuoteItemInput[]): number {
  return items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

// at least 1 line to avoid zeroed labour baseline
function lineCount(items: QuoteItemInput[]): number {
  return Math.max(1, items.length || 0);
}

// simple multiplier based on requested timeframe
function timeframeMult(tf: AiSuggestInput["timeframe"]): number {
  if (tf === "asap") return COEF.asapMult;
  if (tf === "3_6_months") return COEF.midMult;
  return COEF.longMult;
}

// super coarse "distance" buckets by area code complexity
function roughAreaDistance(area: string): number {
  // e.g. "B2" -> 1, "B29" -> 2, "SW1" -> 2/3… It’s intentionally rough.
  if (!area) return 1;
  const digits = area.replace(/^[A-Z]+/i, "");
  return Math.max(1, Math.min(3, digits.length || 1));
}

/** ---------- Main: calculate + model blend ----------
 * 1) Deterministic baseline (materials, labour, overheads, timeline, transport, fee)
 * 2) Ask the ML runtime for a residual add-on (predicts under/over vs baseline)
 * 3) If model is unavailable/unhealthy, use a conservative fallback uplift
 * 4) Suggest a small loyalty discount band for the UI
 */
export async function aiSuggestCosts(input: AiSuggestInput): Promise<AiSuggestResult> {
  const items = input.items || [];

  // 1) Deterministic baseline
  const qSum = qtyFromItems(items);
  const lines = lineCount(items);

  const material = qSum * COEF.unitMaterial;
  const labour = lines * COEF.labourPerLine;
  const base_cost = COEF.baseCost;

  const overhead_cost = (material + labour) * COEF.overheadPct;
  // timeline is just the *extra* above (material+labour), not a whole rebase
  const timeline_cost = (material + labour) * (timeframeMult(input.timeframe) - 1);
  const transport_cost = roughAreaDistance(toArea(input.site_postcode)) * COEF.transportPerArea;

  // subtotal for fee calc (pre-VAT)
  const preFee = base_cost + material + labour + overhead_cost + timeline_cost + transport_cost;
  const service_fee = preFee * COEF.serviceFeePct;

  const baselineSubtotal = preFee + service_fee;

  // 2) Residual from the ML runtime (bucket shrink + kNN + tiny ONNX)
  const features = {
    service_type: input.service_type,
    timeframe: input.timeframe,
    channel: input.channel,
    postcode_area: toArea(input.site_postcode),
    customer_interaction_channel: input.customer?.channel || "",
    qty_sum: qSum || Math.max(material / COEF.unitMaterial, 0), // small guard if qty is 0
    line_count: lines,
    customer_satisfaction: Number(input.customer?.satisfaction ?? 3),
    customer_total_purchases: Number(input.customer?.total_purchases ?? 0),
  };

  // NOTE: predictResidual is expected to return a numeric delta (can be +/-).
  // TODO: add simple health-check flag from runtime if needed.
  let aiAddon = await predictResidual(features);

  // 3) Fallback if model is unavailable or returns non-finite
  if (!Number.isFinite(aiAddon as number)) {
    const starsAdj = 1 + COEF.satisfactionAdjPerStar * (features.customer_satisfaction - 3);
    const loyaltyLikely = features.customer_total_purchases >= 3 ? 1 : 0;
    aiAddon = baselineSubtotal * COEF.aiUplift * starsAdj * (1 + COEF.loyaltyAddOn * loyaltyLikely);
  }

  // 4) Loyalty discount suggestion—tiny, easy to explain on UI
  const orders = features.customer_total_purchases;
  const suggested_discount_pct = orders >= 10 ? 10 : orders >= 5 ? 5 : 0;

  return {
    base_cost: r2(base_cost),
    material_cost: r2(material),
    labour_cost: r2(labour),
    overhead_cost: r2(overhead_cost),
    timeline_cost: r2(timeline_cost),
    transport_cost: r2(transport_cost),
    service_fee: r2(service_fee),
    ai_pred_cost: r2(aiAddon as number),
    vat_percent: COEF.vatPercent,
    suggested_discount_pct,
    reason: `Bucket-shrink mean + kNN${process.env.PRICING_BLEND ? ` (blend=${process.env.PRICING_BLEND})` : ""}.`,
  };
}
