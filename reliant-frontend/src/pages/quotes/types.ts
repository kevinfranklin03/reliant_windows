import { UOM_OPTIONS } from "../../lib/options";

/**
 * Quote line item (UI-side only).
 * Keep this small; the backend has its own schema.
 *
 * Notes:
 * - Either product_id or service_id can be set (or neither for a custom line).
 * - `uom` allows "" to represent “not selected yet”.
 */
export type Row = {
  /** Optional FK to a product row */
  product_id?: string;

  /** Optional FK to a service row */
  service_id?: string;

  /** Free text shown on the quote line */
  description?: string;

  /** Unit of measure from allowed options (or empty while editing) */
  uom?: (typeof UOM_OPTIONS)[number] | "";

  /** Quantity in the chosen UoM */
  quantity: number;
};
