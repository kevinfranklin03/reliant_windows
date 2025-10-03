import { http } from "./http";

export type Service = {
  id: string;
  name: string;
  description?: string;
  pricing_model?: "fixed" | "per_hour" | string; // allow unknowns just in case
  base_rate?: string | number; // server might return stringified numerics
  min_fee?: string | number;
  active?: boolean;
  created_at?: string;
};

type ListServicesParams = {
  limit?: number;   // server clamps (1..500)
  active?: boolean; // true/false filter
  search?: string;  // ILIKE name/description
};

/**
 * GET /api/services
 * Accepts filters and normalizes the server response to a plain array.
 * (Server may return either [{...}] or { rows: [{...}] }.)
 */
export async function listServices(params: ListServicesParams = {}) {
  // Supports both: [{...}] OR { rows: [{...}] }
  const data = await http<Service[] | { rows: Service[] }>({
    path: "/api/services",
    query: params,
  });

  // Normalize to a simple array for callers.
  const rows = Array.isArray((data as any)?.rows)
    ? (data as any).rows
    : Array.isArray(data)
    ? (data as Service[])
    : [];

  return rows;
}
