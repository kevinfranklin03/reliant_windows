import { NavLink } from "react-router-dom";
import {
  Home,
  Users,
  FileText,
  Wrench,
  Package,
  Boxes,
  Truck,
  Route,
  Map,
  ClipboardList,
  Building2,
  Calendar,
  Receipt,
  Coins,
  LineChart,
  Settings,
  Shield,
  Database,
  Lock,
} from "lucide-react";
import React from "react";

/** Tiny helper to render a section header */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
      {children}
    </div>
  );
}

/** Link or locked row (similar to GCP’s “coming soon” feel) */
function RowItem({
  to,
  label,
  icon: Icon,
  locked,
  title,
}: {
  to?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  locked?: boolean;
  title?: string;
}) {
  const base =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition";
  const iconCls = "h-4 w-4 shrink-0";

  if (locked || !to) {
    return (
      <div
        title={title ?? "Coming soon"}
        aria-disabled
        className={`${base} cursor-not-allowed text-white/40 hover:bg-white/5`}
      >
        <Icon className={`${iconCls} opacity-70`} />
        <span className="flex-1">{label}</span>
        <Lock className="h-3.5 w-3.5 opacity-70" />
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? "bg-white/10 text-white"
            : "text-reliant-muted hover:bg-white/5"
        }`
      }
      title={title}
    >
      <Icon className={iconCls} />
      <span className="flex-1">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  // Keep groups tidy; add/lock routes here.
  const groups: Array<{
    title: string;
    items: Array<{
      to?: string;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      locked?: boolean;
      title?: string;
    }>;
  }> = [
    {
      title: "Overview",
      items: [
        { to: "/", label: "Home", icon: Home },
      ],
    },
    {
      title: "Sales",
      items: [
        { to: "/customers", label: "Customers", icon: Users },
        { to: "/make-quote", label: "Make a Quote", icon: FileText },
        { to: "/quotations", label: "Quotations", icon: ClipboardList },
        // Locked: pipeline / tasks (future)
        { label: "Tasks", icon: Calendar, locked: true, title: "Coming soon" },
        { label: "Leads", icon: Building2, locked: true, title: "Coming soon" },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Installations", icon: Wrench, locked: true, title: "Plan & assign crews (coming soon)" },
        { label: "Service & Repairs", icon: Wrench, locked: true, title: "Aftercare workflows (coming soon)" },
        { label: "Scheduling", icon: Calendar, locked: true, title: "Calendar + capacity (coming soon)" },
      ],
    },
    {
      title: "Logistics",
      items: [
        { label: "Deliveries", icon: Truck, locked: true, title: "Van runs, drops, POD (coming soon)" },
        { label: "Routes", icon: Route, locked: true, title: "Route planning (coming soon)" },
        { label: "Live Map", icon: Map, locked: true, title: "Map & zones (coming soon)" },
      ],
    },
    {
      title: "Inventory",
      items: [
        { label: "Products", icon: Package, locked: true, title: "Catalogue & BOMs (coming soon)" },
        { label: "Materials", icon: Boxes, locked: true, title: "Materials & costs (coming soon)" },
        { label: "Suppliers", icon: Database, locked: true, title: "Suppliers & pricing (coming soon)" },
      ],
    },
    {
      title: "Finance",
      items: [
        { label: "Invoices", icon: Receipt, locked: true, title: "Invoice & reconcile (coming soon)" },
        { label: "Payments", icon: Coins, locked: true, title: "Payments & terms (coming soon)" },
        { label: "Reports", icon: LineChart, locked: true, title: "KPIs & dashboards (coming soon)" },
      ],
    },
    {
      title: "Administration",
      items: [
        { to: "/admin", label: "Settings", icon: Settings },
        { label: "Access Control", icon: Shield, locked: true, title: "Roles & permissions (coming soon)" },
        { label: "Audit Log", icon: Database, locked: true, title: "Security & changes (coming soon)" },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-[#0e1840] to-reliant-panel">
      {/* Brand */}
      <div className="p-4">
        <h2 className="text-xl font-semibold tracking-wide">Reliant</h2>
        <p className="text-xs text-white/60">Console</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <div className="mt-1 flex flex-col gap-1 px-2">
              {g.items.map((it) => (
                <RowItem
                  key={`${g.title}:${it.label}`}
                  to={it.to}
                  label={it.label}
                  icon={it.icon}
                  locked={it.locked}
                  title={it.title}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto p-4 text-xs text-reliant-muted">
        © {new Date().getFullYear()} Reliant Windows
      </div>
    </aside>
  );
}
