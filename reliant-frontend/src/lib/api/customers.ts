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
  include_archived?: boolean;  
  only_archived?: boolean; 
};

/** GET /api/customers with optional filters. Returns { rows } from server. */
export async function listCustomers(params: ListCustomersParams = {}) {
  const { has, q, channel, min_satisfaction, limit, include_archived, only_archived } = params;
  return await http<any>({
    path: "/api/customers",
    query: { has, q, channel, min_satisfaction, limit, include_archived, only_archived },
  });
}

export async function createCustomer(data: Partial<Customer>) {
  return await http<Customer>({
    method: "POST",
    path: "/api/customers",
    body: data,
  });
}

export async function archiveCustomer(id: string) {
  return await http<{ ok: true; customer: Customer }>({
    method: "POST",
    path: `/api/customers/${id}/archive`,
  });
}

export async function unarchiveCustomer(id: string) {
  return await http<{ ok: true; customer: Customer }>({
    method: "POST",
    path: `/api/customers/${id}/unarchive`,
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
