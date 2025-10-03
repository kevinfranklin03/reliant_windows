// src/components/Topbar.tsx
import { useEffect, useState } from "react";

type Role = "staff" | "admin";

// read once, default to "staff"
const readInitialRole = (): Role => {
  const ls = localStorage.getItem("role");
  if (ls === "admin" || ls === "staff") return ls;
  const winRole = (window as any).__role as string | undefined;
  return winRole === "admin" ? "admin" : "staff";
};

export default function Topbar() {
  const [role, setRole] = useState<Role>(readInitialRole());

  useEffect(() => {
    localStorage.setItem("role", role);
    (window as any).__role = role;
    window.dispatchEvent(new Event("role-changed"));
  }, [role]);

  return (
    <header>
      <select
        className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        title="Switch role"
        aria-label="Switch role"
      >
        <option value="staff">staff</option>
        <option value="admin">admin</option>
      </select>
    </header>
  );
}
