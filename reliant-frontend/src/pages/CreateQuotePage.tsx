import { useState } from "react";
import { http } from "../lib/api"; // make sure this points to :3000 backend

/**
 * CreateQuotePage
 * ----------------
 * Minimal “create a quote” form:
 * - Collects header fields + (optionally) items
 * - Posts to /api/quotes using the shared http() helper
 *
 * NOTE:
 * - Keep enums in sync with backend. If server rejects a value, surface it nicely.
 * - You can wire this up to your existing QuoteMeta / QuoteCostsPanel later.
 */
export default function CreateQuotePage() {
  // Required header fields
  const [customerId, setCustomerId] = useState("");

  // Enum used in quotes.service.ts ('supply_only' | 'supply_and_install')
  const [serviceMode, setServiceMode] =
    useState<"supply_and_install" | "supply_only">("supply_and_install");

  // Concrete service_id (e.g., Installation) — optional metadata
  const [serviceType, setServiceType] = useState<string>("");


  const [timeframe, setTimeframe] =
    useState<"asap" | "this_month" | "1_3_months" | "3_6_months" | "6_12_months">("asap");

  // Keep this in sync with CHANNEL_OPTIONS on the server
  const [channel, setChannel] =
    useState<"website" | "phone" | "showroom" | "whatsapp" | "social">("website");

  const [sitePostcode, setSitePostcode] = useState("");
  const [notes, setNotes] = useState("");

  // Costs (net) — mirror QuoteCostsPanel state; default to 0
  const [materialCost, setMaterialCost] = useState<number>(0);
  const [labourCost, setLabourCost] = useState<number>(0);
  const [overheadCost, setOverheadCost] = useState<number>(0);
  const [timelineCost, setTimelineCost] = useState<number>(0);
  const [transportCost, setTransportCost] = useState<number>(0);
  const [serviceFee, setServiceFee] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(20);

  // If your API supports nested item create, use this; otherwise omit
  const [items, setItems] = useState<any[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // TODO: basic guardrails (client-side) — fine to keep it minimal
    // if (!customerId) { alert("Customer is required"); return; }

    // Build header payload for public.quotes (server does final validation)
    const payload = {
      customer_id: customerId,
      service_type: serviceMode,       // enum: 'supply_only' | 'supply_and_install'
      timeframe,                       // enum → keep aligned with server
      channel,                         // enum → ditto
      site_postcode: sitePostcode || null,
      notes: notes || null,

      // costs (net)
      material_cost: Number(materialCost) || 0,
      labour_cost: Number(labourCost) || 0,
      overhead_cost: Number(overheadCost) || 0,
      timeline_cost: Number(timelineCost) || 0,
      transport_cost: Number(transportCost) || 0,
      service_fee: Number(serviceFee) || 0,

      // commercial
      discount_pct: Number(discountPct) || 0,
      vat_percent: Number(vatPercent) || 20,

      // Optional metadata: not stored by quotes header unless backend handles it
      primary_service_id: serviceType || null,

      // OPTIONAL: send items if API supports nested insert
      // items: items.map(({ product_id, service_id, description, uom, quantity }) => ({
      //   product_id: product_id || null,
      //   service_id: service_id || null,
      //   description: description || null,
      //   uom,
      //   quantity: Number(quantity) || 0
      // }))
    };

    // POST to your backend (ensure http() uses base URL :3000, not :5173)
    // RIGHT
    const created = await http("POST", "/api/quotes", payload);

    // Show it immediately (either navigate to detail page or refresh list)
    // navigate(`/quotes/${created.id}`);
    console.log("Created quote:", created);
  }

  return (
    <form onSubmit={onSubmit}>
      {/* Wire up your actual form controls here (or plug in QuoteMeta/QuoteCostsPanel). */}
      {/* Example quick inputs (pseudo): */}
      {/* <input value={customerId} onChange={(e)=>setCustomerId(e.target.value)} /> */}
      {/* <select value={serviceMode} onChange={(e)=>setServiceMode(e.target.value as any)} /> */}
      {/* ... */}

      {/* Submit */}
      <button type="submit" className="btn btn-primary">Save quote</button>
    </form>
  );
}
