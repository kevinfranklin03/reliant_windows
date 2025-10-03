import React, { useMemo } from "react";
import { UOM_OPTIONS } from "../../lib/options";
import { Row as BaseRow } from "./types";

// Keep internal typing minimal; do NOT persist `type` anywhere.
// This type is purely for UI state shaping.
type Row = BaseRow & {
  product_id?: string;
  service_id?: string;
  description?: string;
  uom?: any;
  quantity: number;
};

type Props = {
  items: Row[];
  setItems: (rows: Row[]) => void;
  products: any[];
  services: any[];
};

/**
 * QuoteItemsTable
 * ----------------
 * - Lets the user pick a product/service OR enter a custom line.
 * - Defaults UoM/description from the chosen product/service (editable).
 * - Leaves price math to the higher-level page / backend.
 */
export default function QuoteItemsTable({ items, setItems, products, services }: Props) {
  // Quick lookups to avoid repeated finds in render
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p: any) => [p.id, p])),
    [products]
  );
  const serviceMap = useMemo(
    () => Object.fromEntries(services.map((s: any) => [s.id, s])),
    [services]
  );

  // Append a blank row
  const addLine = () =>
    setItems([
      ...items,
      {
        description: "",
        uom: "",
        quantity: 1,
        product_id: undefined,
        service_id: undefined,
      } as Row,
    ]);

  // Remove by index (safe: no server id here)
  const removeLine = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // Shallow patch a row at index
  const updateLine = (idx: number, patch: Partial<Row>) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], ...patch };
    setItems(copy);
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table w-full border-separate border-spacing-x-2 border-spacing-y-2">
        <thead>
          <tr>
            <th style={{ minWidth: 260 }}>Product / Service / Other</th>
            <th>Desc</th>
            <th>UoM</th>
            <th>Qty</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((ln, i) => {
            const selectedId = ln.product_id ?? ln.service_id ?? "";
            const selectedIsProduct = !!ln.product_id;
            const selectedIsService = !!ln.service_id;

            return (
              <tr key={i}>
                <td style={{ minWidth: 260 }}>
                  <select
                    className="field"
                    value={
                      selectedId
                        ? `${selectedIsProduct ? "p" : "s"}:${selectedId}`
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        // Custom line (other) — keep user-entered description/UoM
                        updateLine(i, {
                          product_id: undefined,
                          service_id: undefined,
                        });
                        return;
                      }
                      const [kind, id] = v.split(":");
                      if (kind === "p") {
                        const p = productMap[id];
                        updateLine(i, {
                          product_id: id,
                          service_id: undefined,
                          // Prefer product.uom if available; otherwise keep current
                          uom: (p?.uom as any) ?? ln.uom ?? "",
                          // Keep existing description if user already typed one
                          description: ln.description || p?.name || "",
                        });
                      } else if (kind === "s") {
                        const s = serviceMap[id];
                        updateLine(i, {
                          product_id: undefined,
                          service_id: id,
                          // Default UoM for services if not set
                          uom: ln.uom || "hour",
                          description: ln.description || s?.name || "",
                        });
                      }
                    }}
                  >
                    <option value="">Custom line (other)</option>
                    {products.length > 0 && (
                      <optgroup label="Products">
                        {products.map((p: any) => (
                          <option key={p.id} value={`p:${p.id}`}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {services.length > 0 && (
                      <optgroup label="Services">
                        {services.map((s: any) => (
                          <option key={s.id} value={`s:${s.id}`}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </td>

                <td>
                  <input
                    className="field"
                    placeholder="Line description"
                    value={ln.description ?? ""}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                </td>

                <td style={{ minWidth: 140 }}>
                  <select
                    className="field"
                    value={ln.uom ?? ""}
                    onChange={(e) => updateLine(i, { uom: e.target.value as any })}
                  >
                    <option value="" disabled>
                      Select UoM
                    </option>
                    {UOM_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>

                <td style={{ width: 120 }}>
                  <input
                    className="field text-right"
                    type="number"
                    step="0.01"
                    min={0}
                    value={Number.isFinite(ln.quantity as any) ? ln.quantity : 0}
                    onChange={(e) =>
                      updateLine(i, { quantity: Number(e.target.value || 0) })
                    }
                  />
                </td>

                <td style={{ width: 80, textAlign: "right" }}>
                  <button className="btn btn-danger" onClick={() => removeLine(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={5}>
              <button className="btn" onClick={addLine}>
                + Add line
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
