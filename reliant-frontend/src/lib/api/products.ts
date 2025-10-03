import { http } from "./http";

// API client: Products
// --------------------
// Thin wrapper over GET /api/products with optional filters.
// Keep it boring—server handles validation and clamping.

/**
 * Matches MakeQuote.tsx usage: listProducts({ limit:200, active:true })
 */
type ListProductsParams = {
  limit?: number;     // server clamps to [1..500], default ~200
  active?: boolean;   // serialized as "true"/"false" in query
  category?: string;  // exact match
  material?: string;  // exact match
  search?: string;    // fuzzy: name/type_name/material
};

/** GET /api/products */
export async function listProducts(params: ListProductsParams = {}) {
  const { limit, active, category, material, search } = params;

  // Pass filters as query params; http() will stringify primitives.
  return await http<any>({
    path: "/api/products",
    query: { limit, active, category, material, search },
  });
}
