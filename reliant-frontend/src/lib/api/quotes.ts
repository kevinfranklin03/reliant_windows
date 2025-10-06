
import { get, put, patch, del, http } from "./http";

export type QuoteStatus =
  | "draft" | "issued" | "accepted" | "declined" | "expired" | "converted";

export type Quote = {
  id: string;
  customer_id: string;
  customer?: { name?: string };
  status: QuoteStatus;
  service_type: "supply_only" | "supply_and_install";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  notes?: string | null;
  total_net?: number | string | null;
  vat_amount?: number | string | null;
  total_gross?: number | string | null;
  created_at?: string | null;
  items?: Array<{
    description?: string;
    product_name?: string;
    service_name?: string;
    quantity: number;
    uom?: string;
  }>;
};

export type QuoteItemInput = {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: string;
  quantity: number;
};

type ListReq = {
  status?: QuoteStatus;
  customer_q?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  limit?: number;
};

/** LIST — GET /api/quotes -> { rows: Quote[] } */
export function listQuotes(params: ListReq = {}) {
  return get<{ rows: Quote[] }>("/api/quotes", params);
}

/** READ — GET /api/quotes/:id -> Quote */
export function getQuote(id: string) {
  return get<Quote>(`/api/quotes/${id}`);
}

/** EDIT — PUT /api/quotes/:id */
export function updateQuote(id: string, patchBody: Partial<Quote>) {
  return put<Quote>(`/api/quotes/${id}`, patchBody);
}

/** APPROVE/DECLINE — PATCH /api/quotes/:id/status { status } */
export function updateQuoteStatus(id: string, status: QuoteStatus) {
  return patch<Quote>(`/api/quotes/${id}/status`, { status });
}

/** DELETE — DELETE /api/quotes/:id */
export function deleteQuote(id: string) {
  return del(`/api/quotes/${id}`);
}

/** CREATE — POST /api/quotes */
export async function createQuote(body: {
  customer_id: string;
  // ⚠ required by backend:
  service_type: "supply_only" | "supply_and_install";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  // optional:
  channel?: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  site_postcode?: string | null;
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

  items?: Array<{
    product_id?: string;
    service_id?: string;
    description?: string;
    uom?: string;
    quantity: number;
  }>;
}) {
  // POSitional signature: method, path, body
  return http<Quote>("POST", "/api/quotes", body);
}

/** AI SUGGEST — POST /api/ai-suggest-price */

/** AI SUGGEST — POST /api/ai-suggest-price */
export type PredictCostsPayload = {
  base_cost: number;
  material_cost: number;
  labour_cost: number;
  overhead_cost: number;
  timeline_cost: number;
  transport_cost: number;
  service_fee: number;
  discount: number;   // absolute amount
  vat_rate: number;   // 0..1 (e.g., 0.2 for 20%)
};

export type PredictCostsResponse = {
  ok: true;
  suggestion: {
    net: number;
    gross: number;
    vat_rate: number;  // 0..1
    uplift: number;    // AI add-on (net)
  };
  reason: string;

  // Echoed / convenience fields for the UI:
  base_cost: number;
  material_cost: number;
  labour_cost: number;
  overhead_cost: number;
  timeline_cost: number;
  transport_cost: number;
  service_fee: number;
  ai_pred_cost: number;   // == uplift
  vat_percent: number;    // 0..100 (for your UI controls)
  suggested_discount_pct?: number;
};

export async function predictQuoteCosts(payload: PredictCostsPayload) {
  return await http<PredictCostsResponse>({
    method: "POST",
    path: "/api/ai-suggest-price",
    body: payload,
  });
}

