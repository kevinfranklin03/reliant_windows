
// Session (client-side)
// ---------------------
// Keep it simple for now: a single role string read from localStorage.
// If you add SSR later, keep the try/catch (localStorage may be undefined).

// keep it simple: three roles for now
export type Role = "admin" | "manager" | "staff";

// read a saved role if present; default to "staff"
function loadRole(): Role {
  try {
    const v = localStorage.getItem("reliant.role");
    if (v === "admin" || v === "manager" || v === "staff") return v;
  } catch {
    // noop — likely SSR or storage blocked
  }
  return "staff";
}

// a minimal session object your UI can read
export const session: { role: Role } = {
  role: loadRole(),
};

// TODO: If you later need to change roles at runtime, add a setter that
// writes to localStorage and updates `session.role`, then trigger a UI refresh.
