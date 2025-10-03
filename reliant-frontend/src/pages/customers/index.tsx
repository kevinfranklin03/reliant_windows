import React, { useEffect, useMemo, useState } from "react";
import "./customers.css";
import CustomerModal from "./CustomerModal";
import CustomerTable from "./CustomerTable";
import StarLineFilter from "./StarLineFilter";
import {
  listCustomers,
  deleteCustomer,
} from "../../lib/api/customers";
import type { Customer } from "../../lib/api/types"; 

/**
 * CustomersPage
 * --------------
 * Simple CRUD-ish page:
 *  - Filters + search bar
 *  - Paginated table
 *  - Modal for create/edit
 * Keep the data fetch in a single `load()` to keep things tidy.
 */
export default function CustomersPage() {
  const [rows, setRows]   = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // search + filters
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{
    has: ''|'email'|'phone'|'both'|'none'
    channel: ''|'website'|'phone'|'whatsapp'|'referral'|'social'|'showroom'|'email'
    min_satisfaction: number | ''
  }>({ has:'', channel:'', min_satisfaction:'' });

  // pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<null | Customer>(null);

  /**
   * Fetch with current filters.
   * NOTE: Server already clamps limit; we pass a generous 500 and paginate client-side.
   */
  async function load(){
    setLoading(true); setError(null);
    try{
      const data = await listCustomers({
        has: filters.has || undefined,
        q: search || undefined,
        channel: filters.channel || undefined,
        min_satisfaction: filters.min_satisfaction || undefined,
        // @NOTE: if your backend doesn't accept 'limit', it will be ignored in our lib/api
        limit: 500
      });
      // Server may return either {rows:[...]} or just [...]
      setRows((data as any).rows || (data as any));
      setPage(1); // reset to first page on every new fetch
    } catch (e:any) {
      setError(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  // Initial load (on mount)
  // TIP: you could also debounce search + auto-load on changes if desired.
  useEffect(()=>{ load() },[]);

  function clearFilters(){
    setFilters({ has:'', channel:'', min_satisfaction:'' });
  }

  function openCreate(){
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(c: Customer){
    setEditing(c);
    setModalOpen(true);
  }

  // Hard delete with a confirm guard
  async function handleDelete(c: Customer){
    if(!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try{
      await deleteCustomer(c.id);
      await load();
    } catch (e:any) {
      alert(e?.message || 'Delete failed');
    }
  }

  // Simple client-side pagination
  const { pageCount, pageRows } = useMemo(()=>{
    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pageCount);
    const start = (safePage - 1) * pageSize;
    return { pageCount, pageRows: rows.slice(start, start + pageSize) };
  }, [rows, page, pageSize]);

  return (
    <div className="grid gap-4">
      {/* Top bar (filters/search/actions) */}
      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="field flex-1 min-w-[240px]"
            placeholder="Search customers (name, email, phone, postcode)…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') load() }}
          />

          <select
            className="field field-select text-black dark:text-white"
            value={filters.has}
            onChange={e=>setFilters({...filters,has:e.target.value as any})}
            title="Has contact info"
          >
            <option value="">has: any</option>
            <option value="email">email</option>
            <option value="phone">phone</option>
            <option value="both">both</option>
            <option value="none">none</option>
          </select>

          <select
            className="field field-select text-black dark:text-white"
            value={filters.channel}
            onChange={e=>setFilters({...filters,channel:e.target.value as any})}
            title="Acquisition channel"
          >
            <option value="">channel: any</option>
            <option>website</option><option>phone</option><option>whatsapp</option>
            <option>referral</option><option>social</option><option>showroom</option><option>email</option>
          </select>

          <div className="shrink-0">
            <StarLineFilter
              value={filters.min_satisfaction}
              onChange={(v)=>setFilters({ ...filters, min_satisfaction: v })}
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn" onClick={clearFilters}>Clear</button>
            <button className="btn-primary" onClick={load}>Apply</button>
            <button className="btn" onClick={openCreate}>+ New</button>
          </div>
        </div>
      </div>

      {/* Table + pagination */}
      <CustomerTable
        rows={rows}
        pageRows={pageRows}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        setPage={setPage}
        setPageSize={(n)=>setPageSize(n)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* Create/Edit modal */}
      <CustomerModal
        open={modalOpen}
        onClose={()=>setModalOpen(false)}
        onSaved={load}
        editing={editing}
      />
    </div>
  );
}
