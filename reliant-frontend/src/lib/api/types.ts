/** ===== Reliant types synced with Postgres enums =====
 * channel:        website | phone | whatsapp | referral | social | showroom | email
 * quote_status:   draft | issued | accepted | declined | expired | converted
 * service_type:   supply_only | supply_and_install
 * timeframe:      asap | 3_6_months | 6_12_months
 * uom_code:       unit | sqm | lm | hour
 * user_role:      admin | manager | staff
 */

// Exact unions from DB (useful for display & narrowing)

export type Channel = "website" | "phone" | "social" | "showroom" | "whatsapp" | "referral" | "email";
export type Timeframe = "asap" | "3_6_months" | "6_12_months";

export type Uom = "unit" | "sqm" | "metre" | "hour" | string;

export interface QuoteItemInput {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: Uom;
  quantity: number;
}

export interface AiSuggestRequest {
  customer_id?: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: Timeframe;
  channel: Channel;
  site_postcode?: string;
  items: QuoteItemInput[];
}

export interface AiSuggestResponse {
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

export interface CreateQuoteRequest {
  customer_id: string;
  service_type: "supply_and_install" | "supply_only";
  timeframe: Timeframe;
  channel: Channel;
  site_postcode?: string;
  notes?: string;
  items: QuoteItemInput[];
  base_cost?: number;
  material_cost?: number;
  labour_cost?: number;
  overhead_cost?: number;
  timeline_cost?: number;
  transport_cost?: number;
  service_fee?: number;
  ai_pred_cost?: number;
  discount_pct?: number;
  vat_percent?: number;
  vat_amount?: number;
  total_net?: number;
  total_gross?: number;
}

export interface CreateQuoteResponse {
  id: string;
}

export interface ListCustomersReq {
  page?: number;
  pageSize?: number;


  limit?: number;

  active?: boolean;
  filters?: any;
}

export interface CustomerRow {
  id: string;
  contact_name?: string;
  company_name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface ListCustomersResp {
  rows: CustomerRow[];
  total?: number;
}


export type QuoteStatus =
  | "draft"
  | "issued"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

export type ServiceType = "supply_only" | "supply_and_install";


export type UomCode = "unit" | "sqm" | "lm" | "hour";

export type UserRole = "admin" | "manager" | "staff";

/** ===== API DTOs (kept lenient on inputs) ===== */

// Customers
export type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  postcode?: string | null;
  satisfaction?: number | null; // 1..5
  total_purchases?: number | null;
  interaction_channel?: Channel | string | null; // accept raw strings from forms
  created_at?: string;
};

// Products (minimal shape your UI uses)
export type Product = {
  id: string;
  name: string;
  category?: string | null;
  type_name?: string | null;
  material?: "uPVC" | "aluminium" | "composite" | "timber" | "other" | string | null;
  uom?: UomCode | string | null;
  base_price?: number | null;
  active?: boolean;
  created_at?: string;
};

// Services (for MakeQuote services list)
export type Service = {
  id: string;
  name: string;
  description?: string | null;
  pricing_model?: "per_unit" | "per_hour" | "fixed" | "per_sqm" | "per_lm" | string;
  base_rate?: number | null;
  min_fee?: number | null;
  active?: boolean;
  created_at?: string;
};



// Quote entity
export type Quote = {
  id: string;
  customer_id: string;
  customer?: { id: string; name?: string } | null;

  status: QuoteStatus;
  service_type: ServiceType | string;       // allow string for forward-compat
  timeframe: Timeframe | string;
  channel?: Channel | string | null;

  site_postcode?: string | null;
  issued_by?: string | null;
  approved_by?: string | null;
  notes?: string | null;

  base_cost?: number | null;
  material_cost?: number | null;
  labour_cost?: number | null;
  overhead_cost?: number | null;
  timeline_cost?: number | null;
  transport_cost?: number | null;
  service_fee?: number | null;
  ai_pred_cost?: number | null;
  discount_pct?: number | null;
  vat_percent?: number | null;
  vat_amount?: number | null;
  total_net?: number | null;
  total_gross?: number | null;

  created_at?: string;
  issued_at?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;

  items?: Array<{
    description?: string;
    product_name?: string;
    service_name?: string;
    quantity?: number;
    uom?: UomCode | string;
  }>;
};

/** ===== Handy option arrays for selects (optional) ===== */
export const CHANNEL_OPTIONS: Channel[] = [
  "website",
  "phone",
  "whatsapp",
  "referral",
  "social",
  "showroom",
  "email",
];

export const QUOTE_STATUS_OPTIONS: QuoteStatus[] = [
  "draft",
  "issued",
  "accepted",
  "declined",
  "expired",
  "converted",
];

export const SERVICE_TYPE_OPTIONS: ServiceType[] = [
  "supply_only",
  "supply_and_install",
];

export const TIMEFRAME_OPTIONS: Timeframe[] = [
  "asap",
  "3_6_months",
  "6_12_months",
];

export const UOM_OPTIONS: UomCode[] = ["unit", "sqm", "lm", "hour"];
