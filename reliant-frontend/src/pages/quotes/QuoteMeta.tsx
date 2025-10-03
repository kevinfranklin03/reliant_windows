import React from "react";
import { TIMEFRAME_OPTIONS, CHANNEL_OPTIONS } from "../../lib/options";
import { pretty } from "./utils";

type Props = {
  // Customers (dropdown)
  customers: any[];
  customerId: string;
  setCustomerId: (v: string) => void;

  // Services list + selected service id (purely UI; not required to price)
  services: Array<{ id: string; name: string; description?: string }>;
  serviceType: string;                 // holds selected service_id
  setServiceType: (v: string) => void;

  // Timeframe & Channel (required for rule-based/ops flow)
  timeframe: (typeof TIMEFRAME_OPTIONS)[number];
  setTimeframe: (v: (typeof TIMEFRAME_OPTIONS)[number]) => void;

  channel: (typeof CHANNEL_OPTIONS)[number];
  setChannel: (v: (typeof CHANNEL_OPTIONS)[number]) => void;

  // Site postcode (free text; validated server-side if needed)
  sitePostcode: string;
  setSitePostcode: (v: string) => void;

  // Back-compat: parent may still pass these; we accept but don't use here.
  // Keeping them avoids prop churn while the page evolves.
  serviceMode?: "supply_and_install" | "supply_only";
  setServiceMode?: (v: "supply_and_install" | "supply_only") => void;
};

/**
 * QuoteMeta
 * ----------
 * Small “header” form for a quote:
 * - Customer selector
 * - Optional service picker (if you expose services)
 * - Timeframe + acquisition channel
 * - Site postcode (for transport/area heuristics)
 *
 * Keep it dumb: no data fetching here; parent owns data + side effects.
 */
export default function QuoteMeta({
  customers, customerId, setCustomerId,
  services, serviceType, setServiceType,
  timeframe, setTimeframe,
  channel, setChannel,
  sitePostcode, setSitePostcode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  serviceMode, setServiceMode,
}: Props) {
  const hasServices = Array.isArray(services) && services.length > 0;

  return (
    <>
      {/* Customer */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="qm-customer">Customer</label>
        <select
          id="qm-customer"
          className="field"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Select customer</option>
          {customers.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.email ? `– ${c.email}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Service type (pick from Services list) */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="qm-service-type">Service type</label>
        <select
          id="qm-service-type"
          className="field"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          disabled={!hasServices} // UX: make it obvious when there’s nothing to pick
        >
          {hasServices ? (
            <>
              <option value="">Select service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </>
          ) : (
            <option value="">No services available</option>
          )}
        </select>
      </div>

      {/* Timeframe */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="qm-timeframe">Timeframe</label>
        <select
          id="qm-timeframe"
          className="field"
          value={timeframe}
          onChange={(e) =>
            setTimeframe(e.target.value as (typeof TIMEFRAME_OPTIONS)[number])
          }
        >
          {TIMEFRAME_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v === "asap"
                ? "ASAP"
                // pretty("3_6_months") => "3 6 months"; fix to 3–6
                : pretty(v).replace("3 6", "3–6").replace("6 12", "6–12")}
            </option>
          ))}
        </select>
      </div>

      {/* Channel */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="qm-channel">Channel</label>
        <select
          id="qm-channel"
          className="field"
          value={channel}
          onChange={(e) =>
            setChannel(e.target.value as (typeof CHANNEL_OPTIONS)[number])
          }
        >
          {CHANNEL_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {pretty(v)}
            </option>
          ))}
        </select>
      </div>

      {/* Site Postcode */}
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="qm-postcode">Site postcode</label>
        <input
          id="qm-postcode"
          className="field"
          placeholder="e.g., B31 2AB"
          value={sitePostcode}
          onChange={(e) => setSitePostcode(e.target.value)}
        />
      </div>
    </>
  );
}
