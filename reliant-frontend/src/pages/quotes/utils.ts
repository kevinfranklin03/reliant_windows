// Turn enum-ish strings into nicer labels for the UI.
// - "asap" → "ASAP"
// - "supply_and_install" → "Supply & install"
// - everything else: replace "_" with space
export const pretty = (v: string) =>
  v === "asap"
    ? "ASAP"
    : v === "supply_and_install"
    ? "Supply & install"
    : v.replace(/_/g, " ");

// Safe number parse: coerce to Number, fall back to 0 if NaN/Infinity.
export function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Round to 2 decimal places (float-safe).
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Format a number to "0.00" style (string output).
export function fmt(n: number) {
  return n.toFixed(2);
}
