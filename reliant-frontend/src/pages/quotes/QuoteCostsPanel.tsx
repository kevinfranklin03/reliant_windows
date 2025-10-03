import React from "react";
import { fmt, num, round2 } from "./utils";

type Props = {
  baseCost: number; setBaseCost: (n:number)=>void;
  materialCost: number; setMaterialCost: (n:number)=>void;
  labourCost: number; setLabourCost: (n:number)=>void;
  overheadCost: number; setOverheadCost: (n:number)=>void;
  timelineCost: number; setTimelineCost: (n:number)=>void;
  transportCost: number; setTransportCost: (n:number)=>void;
  serviceFee: number; setServiceFee: (n:number)=>void;
  aiPredCost: number|null; setAiPredCost: (n:number|null)=>void;

  discountPct: number; setDiscountPct: (n:number)=>void;
  vatPercent: number; setVatPercent: (n:number)=>void;

  vatAmount: number;
  discountedNet: number;
  totalGross: number;

  onSuggestAI: () => void;
  suggestionReason?: string;
};

/**
 * QuoteCostsPanel
 * ----------------
 * Controlled inputs for all cost fields.
 * - Numbers are parsed with `num()` (safe-to-number helper) to avoid NaN.
 * - Gross/Net/VAT are read-only (computed in parent).
 * - "AI suggest" just calls back up; parent decides what to set.
 */
export default function QuoteCostsPanel(p: Props) {
  return (
    <div className="grid gap-3">
      <h3 className="m-0 font-semibold">Costs</h3>

      {/* Editable cost fields (net) */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "1fr 1fr", alignItems: "center" }}
      >
        <label>Base cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.baseCost}
          onChange={(e) => p.setBaseCost(num(e.target.value))}
        />

        <label>Material cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.materialCost}
          onChange={(e) => p.setMaterialCost(num(e.target.value))}
        />

        <label>Labour cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.labourCost}
          onChange={(e) => p.setLabourCost(num(e.target.value))}
        />

        <label>Overhead cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.overheadCost}
          onChange={(e) => p.setOverheadCost(num(e.target.value))}
        />

        <label>Timeline cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.timelineCost}
          onChange={(e) => p.setTimelineCost(num(e.target.value))}
        />

        <label>Transport cost</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.transportCost}
          onChange={(e) => p.setTransportCost(num(e.target.value))}
        />

        <label>Service fee</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.serviceFee}
          onChange={(e) => p.setServiceFee(num(e.target.value))}
        />

        <label>AI predicted add-on</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.aiPredCost ?? 0}
          // Keep manual edits sane; coerce to 0 when input is invalid
          onChange={(e) =>
            p.setAiPredCost(
              Number.isFinite(+e.target.value) ? round2(+e.target.value) : 0
            )
          }
        />
      </div>

      {/* AI helper */}
      <div className="flex items-center gap-2">
        <button className="btn" onClick={p.onSuggestAI} title="Use history and BOM to suggest costs">
          🤖 AI suggest costs
        </button>
        <small className="text-reliant-muted">
          This fills the fields above; you can still edit manually.
        </small>
      </div>

      <hr className="border-white/10" />

      {/* Discounts & totals */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "1fr 1fr", alignItems: "center" }}
      >
        <label>Discount %</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.discountPct}
          onChange={(e) => p.setDiscountPct(num(e.target.value))}
        />

        <label>VAT %</label>
        <input
          className="field text-right"
          type="number"
          step="0.01"
          value={p.vatPercent}
          onChange={(e) => p.setVatPercent(num(e.target.value))}
        />

        <label>VAT amount</label>
        <input className="field input-ro text-right" readOnly value={fmt(p.vatAmount)} />

        <label>Total (net)</label>
        <input className="field input-ro text-right" readOnly value={fmt(p.discountedNet)} />

        <label className="font-semibold">Total (gross)</label>
        <input className="field text-right" readOnly value={fmt(p.totalGross)} />
      </div>

      {/* Why the AI suggested what it did (short explainer from backend) */}
      {p.suggestionReason ? (
        <div className="suggest-reason">
          <strong>Suggestion reason:</strong> {p.suggestionReason}
        </div>
      ) : null}
    </div>
  );
}
