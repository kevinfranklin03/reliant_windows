import { http } from "./http";
import type { Customer } from "./types";

/**
 * API client: Customers
 * ---------------------
 * Thin wrappers around /api/customers endpoints.
 * Keep these boring—let server handle validation/shape.
 */

// Matches your Customers.tsx calls: { has, q, channel, min_satisfaction, limit }
type ListCustomersParams = {
  has?: "email" | "phone" | "both" | "none";
  q?: string;
  channel?: string;
  min_satisfaction?: number | ""; // allow "" → server treats as undefined
  limit?: number;                 // server clamps (default ~50/200)
};

/** GET /api/customers with optional filters. Returns { rows } from server. */
export async function listCustomers(params: ListCustomersParams = {}) {
  const { has, q, channel, min_satisfaction, limit } = params;
  // Pass through as query params; server normalizes types.
  return await http<any>({
    path: "/api/customers",
    query: { has, q, channel, min_satisfaction, limit },
  });
}

/** POST /api/customers – create a customer (partial allowed). */
export async function createCustomer(data: Partial<Customer>) {
  return await http<Customer>({
    method: "POST",
    path: "/api/customers",
    body: data,
  });
}

/** PATCH /api/customers/:id – partial update. */
export async function updateCustomer(id: string, data: Partial<Customer>) {
  return await http<Customer>({
    method: "PATCH",
    path: `/api/customers/${id}`,
    body: data,
  });
}

/** DELETE /api/customers/:id – returns { success: true } on success. */
export async function deleteCustomer(id: string) {
  return await http<{ success: true }>({
    method: "DELETE",
    path: `/api/customers/${id}`,
  });
}
