import { useEffect, useState } from "react";
// Keep imports explicit (tree-shakeable)
import { listCustomers } from "../lib/api/customers";
import { listQuotes } from "../lib/api/quotes";

// Tiny currency helper (string → number → "0.00")
function money(value: unknown) {
  const n =
    typeof value === "string" ? parseFloat(value) :
    typeof value === "number" ? value :
    0;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export default function Home() {
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    (async () => {
      const [cust, quotes] = await Promise.all([
        listCustomers({ limit: 5 }),
        listQuotes({ limit: 5 }),
      ]);
      setStats({
        recentCustomers: cust?.rows || cust || [],
        recentQuotes: quotes?.rows || quotes || [],
      });
    })();
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Quick nav */}
      <div className="card">
        <h3 className="mb-2 text-lg font-semibold">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href="/customers">Customers</a>
          <a className="btn-primary" href="/make-quote">Make a Quote</a>
          <a className="btn" href="/quotations">Quotations</a>
          <a className="btn" href="/admin">Admin</a>
        </div>
      </div>

      {/* Stack overview (replaces former "System" card) */}
      <div className="card">
        <h3 className="mb-2 text-lg font-semibold">Stack</h3>
        <ul className="list-disc pl-6 text-reliant-muted">
          <li>Backend: Node.js + TypeScript + Express</li>
          <li>Frontend: React</li>
          <li>Database: PostgreSQL</li>
        </ul>
      </div>

      {/* Recent customers */}
      <div className="card">
        <h3 className="mb-3 text-lg font-semibold">Recent Customers</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="thead">
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Phone</th>
                <th className="th">Satisfaction</th>
              </tr>
            </thead>
            <tbody>
              {(stats.recentCustomers || []).map((c: any) => (
                <tr key={c.id} className="hover:bg-white/5">
                  <td className="td">{c.name}</td>
                  <td className="td">{c.email || "-"}</td>
                  <td className="td">{c.phone || "-"}</td>
                  <td className="td">{c.satisfaction ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent quotes */}
      <div className="card">
        <h3 className="mb-3 text-lg font-semibold">Recent Quotes</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="thead">
              <tr>
                <th className="th">ID</th>
                <th className="th">Status</th>
                <th className="th">Customer</th>
                <th className="th">Total</th>
              </tr>
            </thead>
            <tbody>
              {(stats.recentQuotes || []).map((q: any) => (
                <tr key={q.id} className="hover:bg-white/5">
                  <td className="td">{q.id.slice(0, 8)}</td>
                  <td className="td">
                    <span className="badge">{q.status}</span>
                  </td>
                  <td className="td">{q.customer_id?.slice(0, 8)}</td>
                  <td className="td">£{money(q.total_gross ?? q.total_net ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
