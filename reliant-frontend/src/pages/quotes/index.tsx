import React, { useEffect, useState } from "react";
import "./quoteStyles.css";

import {
  createQuote,
  listCustomers,
  predictQuoteCosts,
  type QuoteItemInput,
} from "../../lib/api";

import {
  TIMEFRAME_OPTIONS,
  CHANNEL_OPTIONS,
} from "../../lib/options";

import QuoteMeta from "./QuoteMeta";
import QuoteItemsTable from "./QuoteItemsTable";
import QuoteCostsPanel from "./QuoteCostsPanel";
import InternalNotes from "./InternalNotes";

import { Row } from "./types";
import { num, round2 } from "./utils";

/**
 * MakeQuotePage
 * -------------
 * Flow:
 *  1) Load customers/products/services for pickers
 *  2) Build lines, run either rule-based calc or AI suggestion
 *  3) Create quote with the resulting costs
 * Keep this page as an orchestrator; actual math lives in api/services.
 */
export default function MakeQuotePage() {
  document.title = "Make a Quote"; // simple page title set; fine for SPA

  // Supply/install mode toggles labour factor and hints to AI
  const [serviceMode, setServiceMode] =
    useState<"supply_and_install" | "supply_only">("supply_and_install");

  // Local workflow state
  const [status, setStatus] = useState<"draft"|"issued"|"accepted"|"declined"|"expired"|"converted">("draft");
  const [calcRan, setCalcRan] = useState(false); // we require at least one calc before submit
  const [quoteId] = useState<string>("QUOTE-XXXX"); // placeholder shown in UI

  // Selections
  const [services, setServices] = useState<any[]>([]);
  const [serviceType, setServiceType] = useState<string>(""); // service_id if used
  const [timeframe, setTimeframe]   = useState<(typeof TIMEFRAME_OPTIONS)[number]>("3_6_months");
  const [channel, setChannel]       = useState<(typeof CHANNEL_OPTIONS)[number]>("website");

  const [customerId, setCustomerId] = useState<string>("");
  const [sitePostcode, setSitePostcode] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState<string>("");

  const [customers, setCustomers] = useState<any[]>([]);

  // Lines (start with an empty editable row)
  const [items, setItems] = useState<Row[]>([{ description: "", uom: "", quantity: 1 }]);

  // Cost fields (net)
  const [baseCost, setBaseCost] = useState(0);
  const [materialCost, setMaterialCost] = useState(0);
  const [labourCost, setLabourCost] = useState(0);
  const [overheadCost, setOverheadCost] = useState(0);
  const [timelineCost, setTimelineCost] = useState(0);
  const [transportCost, setTransportCost] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [aiPredCost, setAiPredCost] = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [vatPercent, setVatPercent] = useState(20);
  const [suggestionReason, setSuggestionReason] = useState("");
  const [products, setProducts] = useState<any[]>([]);

  // Totals (derived)
  const subtotal =
    baseCost + materialCost + labourCost + overheadCost + timelineCost + transportCost + serviceFee + (aiPredCost ?? 0);
  const discountedNet = round2(subtotal * (1 - (discountPct || 0) / 100));
  const vatAmount     = round2(discountedNet * (vatPercent / 100));
  const totalGross    = round2(discountedNet + vatAmount);

  // Bootstrap: customers, products, services
  useEffect(() => {
    (async () => {
      // customers (existing)
      const cust = await listCustomers({ limit: 200 } as any);
      setCustomers(Array.isArray(cust?.rows) ? cust.rows : cust || []);

      // products (API client exists; using fetch here is fine too)
      try {
        const res = await fetch("/api/products"); // Vite proxy → 3000
        if (!res.ok) throw new Error(`products ${res.status}`);
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load products", e);
        setProducts([]);
      }

      // services (optional—depends on backend)
      try {
        const res = await fetch("/api/services");
        if (res.ok) {
          const data = await res.json();
          setServices(Array.isArray(data) ? data : []);
        } else {
          setServices([]);
        }
      } catch {
        setServices([]);
      }
    })();
  }, []);

  /**
   * Simple deterministic calculator for fast feedback.
   * Useful as a baseline before asking the AI residual.
   */
  const ruleBasedCalculate = () => {
    const qtySum = items.reduce((s, r) => s + Number(r.quantity || 0), 0);
    const mat = qtySum * 25;
    const labourFactor = serviceMode === "supply_and_install" ? 85 : 35;
    const lab = items.length * labourFactor;
    const over = round2((mat + lab) * 0.12);
    const timeMul = timeframe === "asap" ? 1.15 : timeframe === "3_6_months" ? 1.0 : 0.95;
    const timeCost = round2((mat + lab) * (timeMul - 1));
    const transport = sitePostcode?.trim() ? 35 : 0;
    const svcFee = 15;

    setMaterialCost(round2(mat));
    setLabourCost(round2(lab));
    setOverheadCost(over);
    setTimelineCost(timeCost);
    setTransportCost(transport);
    setServiceFee(svcFee);
    setBaseCost(0);
    setAiPredCost(null);

    setSuggestionReason("Calculated using fixed rates, multipliers, and item details.");
    setCalcRan(true);
  };

  /**
   * Ask the server for a blended estimate (rule + residual).
   * Leaves UI costs in place if the API returns partials.
   */
  const suggestWithAI = async () => {
    try {
      const payloadItems: QuoteItemInput[] = items.map((r) => ({
        product_id: r.product_id || undefined,
        service_id: r.service_id || undefined,
        description: r.description || undefined,
        uom: r.uom || undefined,
        quantity: Number(r.quantity || 0),
      }));

      // Send snake_case keys that the API expects
      // Pass serviceMode to match the model/service types
      const est = await predictQuoteCosts({
        customer_id: customerId || undefined,
        service_type: serviceMode,          // <-- critical for labour assumptions
        timeframe,
        channel,
        site_postcode: sitePostcode || undefined,
        items: payloadItems,
      });

      // Apply returned fields individually so we handle partial responses gracefully
      if (est?.material_cost != null) setMaterialCost(num(est.material_cost));
      if (est?.labour_cost   != null) setLabourCost(num(est.labour_cost));
      if (est?.overhead_cost != null) setOverheadCost(num(est.overhead_cost));
      if (est?.timeline_cost != null) setTimelineCost(num(est.timeline_cost));
      if (est?.transport_cost!= null) setTransportCost(num(est.transport_cost));
      if (est?.service_fee   != null) setServiceFee(num(est.service_fee));
      if (est?.base_cost     != null) setBaseCost(num(est.base_cost));
      if (est?.ai_pred_cost  != null) setAiPredCost(num(est.ai_pred_cost));
      if (est?.vat_percent   != null) setVatPercent(num(est.vat_percent));
      if (est?.suggested_discount_pct != null) setDiscountPct(num(est.suggested_discount_pct));

      setSuggestionReason(est?.reason || "AI prediction based on historical patterns and similar quotes.");
      setCalcRan(true);
    } catch (e: any) {
      alert(`AI estimate failed: ${e?.message || e}`);
    }
  };

  /**
   * Submit quote creation (header + items), using current cost fields.
   * NOTE: Items are included here; backend stores header and item rows.
   */
  const submitCreate = async () => {
    if (!customerId) { alert("Pick a customer."); return; }
    if (!items.length) { alert("Add at least one line."); return; }

    const payloadItems: QuoteItemInput[] = items.map((r) => ({
      product_id: r.product_id || undefined,
      service_id: r.service_id || undefined,
      description: r.description || undefined,
      uom: r.uom || undefined,
      quantity: Number(r.quantity || 0),
    }));

    const res = await createQuote({
      customer_id: customerId,
      service_type: serviceMode,
      timeframe,
      channel,
      site_postcode: sitePostcode || undefined,
      notes: internalNotes || undefined,
      items: payloadItems,

      // costs (net)
      base_cost: round2(baseCost),
      material_cost: round2(materialCost),
      labour_cost: round2(labourCost),
      overhead_cost: round2(overheadCost),
      timeline_cost: round2(timelineCost),
      transport_cost: round2(transportCost),
      service_fee: round2(serviceFee),
      ai_pred_cost: aiPredCost != null ? round2(aiPredCost) : undefined,
      discount_pct: round2(discountPct),

      // tax/totals
      vat_percent: round2(vatPercent),
      vat_amount: round2(vatAmount),
      total_net: round2(discountedNet),
      total_gross: round2(totalGross),
    } as any);

    setStatus("draft");
    alert(`Quote created as draft: ${res?.id ?? "(no id returned)"}`);
  };

  // For demo: we don’t persist "issued" here; just reflect UI intent
  const submitIssue = async () => {
    if (!calcRan) { alert("Run Rule-Based or AI Suggest first."); return; }
    setStatus("issued");
    alert("Quote issued. Note: Managers/admins can approve after issuance.");
  };

  // Little helper for the badge color/state
  const badgeClass =
    status === "issued" ? "badge badge--issued" :
    status === "accepted" ? "badge badge--accepted" :
    status === "declined" ? "badge badge--declined" :
    status === "expired" ? "badge badge--expired" :
    status === "converted" ? "badge badge--converted" :
    "badge badge--draft";

  return (
    <main className="px-4 md:px-6 lg:px-8 py-4">
      <div className="mb-3 text-sm text-reliant-muted">make quote</div>

      <div className="make-quote__header">
        <div className="flex items-center gap-3">
          <a href="#" className="btn">← Back</a>
          <div>
            <h1 className="make-quote__title">Create New Quote</h1>
            <div className="quote-id">ID: {quoteId}</div>
          </div>
        </div>
        <span className={badgeClass}>{status.toUpperCase()}</span>
      </div>

      <section className="make-quote__grid">
        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="h2">Customer Information</h2>
            <QuoteMeta
              customers={customers}
              customerId={customerId} setCustomerId={setCustomerId}
              serviceMode={serviceMode} setServiceMode={setServiceMode}   // toggle mode here
              services={services}
              serviceType={serviceType} setServiceType={setServiceType}
              timeframe={timeframe} setTimeframe={setTimeframe}
              channel={channel} setChannel={setChannel}
              sitePostcode={sitePostcode} setSitePostcode={setSitePostcode}
            />
          </div>

          <div className="card">
            <h2 className="h2">Quote Items</h2>
            <QuoteItemsTable
              items={items}
              setItems={setItems}
              products={products}   // may be large; consider typeahead + server paging later
              services={services}   // optional
            />
          </div>

          <div className="card">
            <h2 className="h2">Notes</h2>
            <InternalNotes
              internalNotes={internalNotes}
              setInternalNotes={setInternalNotes}
            />
            <small className="subtle">
              Quotes can be approved by managers/admins after issuance.
            </small>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card">
            <h2 className="h2">Cost Summary</h2>
            <QuoteCostsPanel
              baseCost={baseCost} setBaseCost={setBaseCost}
              materialCost={materialCost} setMaterialCost={setMaterialCost}
              labourCost={labourCost} setLabourCost={setLabourCost}
              overheadCost={overheadCost} setOverheadCost={setOverheadCost}
              timelineCost={timelineCost} setTimelineCost={setTimelineCost}
              transportCost={transportCost} setTransportCost={setTransportCost}
              serviceFee={serviceFee} setServiceFee={setServiceFee}
              aiPredCost={aiPredCost} setAiPredCost={setAiPredCost}
              discountPct={discountPct} setDiscountPct={setDiscountPct}
              vatPercent={vatPercent} setVatPercent={setVatPercent}
              vatAmount={vatAmount}
              discountedNet={discountedNet}
              totalGross={totalGross}
              onSuggestAI={suggestWithAI}
              suggestionReason={suggestionReason}
            />
          </div>

          {/* Sticky actions (prints nicely) */}
          <div className="actions-bar actions-bar--fixed card">
            <div
              className="actions-row"
              style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}
            >
              <button className="btn" onClick={ruleBasedCalculate}>Rule-Based Calculate</button>
              <button className="btn btn-primary" disabled={!calcRan} onClick={submitCreate}>Create</button>
              <button className="btn" onClick={() => window.print()}>Export PDF</button>
              <button className="btn" onClick={() => window.history.back()}>Cancel</button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
