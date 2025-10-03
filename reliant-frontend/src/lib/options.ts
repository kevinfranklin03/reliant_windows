
// Centralised option lists for selects / validation.
// Keep these in sync with your DB enums and server-side whitelists.

export const CHANNEL_OPTIONS = [
  "website",
  "phone",
  "whatsapp",
  "referral",
  "social",
  "showroom",
  "email",
] as const;

export const QUOTE_STATUS_OPTIONS = [
  "draft",
  "issued",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;

export const SERVICE_TYPE_OPTIONS = [
  "supply_only",
  "supply_and_install",
] as const;

export const TIMEFRAME_OPTIONS = [
  "asap",
  "3_6_months",
  "6_12_months",
] as const;

export const UOM_OPTIONS = [
  "unit",
  "sqm",
  "lm",
  "hour",
] as const;

// Tip: derive union types if you need them in TS:
// export type Channel = typeof CHANNEL_OPTIONS[number];
