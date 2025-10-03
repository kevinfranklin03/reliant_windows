
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
export async function predictQuoteCosts(payload: {
  customer_id?: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: "asap" | "3_6_months" | "6_12_months";
  channel: "website" | "phone" | "whatsapp" | "referral" | "social" | "showroom" | "email";
  site_postcode?: string;
  items: Array<{ product_id?: string; service_id?: string; description?: string; uom?: string; quantity: number }>;
}) {
  return http("POST", "/api/ai-suggest-price", payload);
}
