import { useEffect, useMemo, useState } from 'react'
import {
  listQuotes,
  getQuote,
  updateQuote,
  updateQuoteStatus,
  type Quote,
  session as apiSession,
} from '../lib/api'

type Filters = {
  status: '' | Quote['status']
  customer_q: string
  from: string
  to: string
}

// Safely number-ify values that may be string/null from the API
const money = (v: any) => Number(v ?? 0)

// ---- NEW: robust coercion helpers ----
function tryParseJSON<T>(txt: any): T | null {
  if (typeof txt !== 'string') return null
  try { return JSON.parse(txt) as T } catch { return null }
}
function toArray<T = any>(data: any): T[] {
  // Accept shapes: {rows: [...]}, [...], "json string", "csv string" -> []
  if (Array.isArray(data)) return data as T[]
  if (data && Array.isArray(data.rows)) return data.rows as T[]
  const parsed = tryParseJSON<any>(data)
  if (parsed) {
    if (Array.isArray(parsed)) return parsed as T[]
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows as T[]
  }
  return []
}

export default function Quotations() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- role state (simple local-only switch; Topbar writes localStorage + dispatches event)
  const getRole = () =>
    localStorage.getItem('role') ||
    (typeof window !== 'undefined' && (window as any).__role) ||
    (apiSession as any)?.role ||
    'employee'

  const [role, setRole] = useState<string>(getRole())
  const canEdit = role === 'admin'

  useEffect(() => {
    const onRole = () => setRole(getRole())
    window.addEventListener('role-changed', onRole)
    return () => window.removeEventListener('role-changed', onRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [filters, setFilters] = useState<Filters>({
    status: '',
    customer_q: '',
    from: '',
    to: '',
  })

  // pagination (client-side)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // right-side drawer detail
  const [detail, setDetail] = useState<any | null>(null)

  // edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<Partial<Quote>>({})

  async function load() {
    setLoading(true); setError(null)
    try {
      const data = await listQuotes({
        status: filters.status || undefined,
        customer_q: filters.customer_q || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: 500,
      })
      const arr = toArray((data as any))
      setRows(arr)
      setPage(1)
      // If the server returned non-JSON text (CSV), show a hint once
      if (!Array.isArray(arr) || arr.length === 0) {
        const looksText = typeof (data as any) === 'string'
        if (looksText) {
          setError('Server returned non-JSON for /quotes (e.g., CSV). Showing empty list.')
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load quotes')
      setRows([]) // ensure array
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // initial

  async function open(id: string) {
    const data = await getQuote(id)
    setDetail(data)
  }

  function clearFilters() {
    setFilters({ status: '', customer_q: '', from: '', to: '' })
  }

  function openEdit(q: any) {
    if (!canEdit) { alert('Only admins can edit quotes.'); return }
    setEditing(q)
    setForm({
      id: q.id,
      status: q.status,
      timeframe: q.timeframe,
      service_type: q.service_type,
      notes: q.notes ?? '',
    })
    setModalOpen(true)
  }

  async function saveEdit() {
    if (!canEdit) { alert('Only admins can save changes.'); return }
    if (!editing?.id) return
    try {
      await updateQuote(editing.id, {
        status: form.status,
        timeframe: form.timeframe,
        service_type: form.service_type,
        notes: form.notes,
      } as any)
      setModalOpen(false)
      await load()
      if (detail?.id === editing.id) {
        const fresh = await getQuote(editing.id)
        setDetail(fresh)
      }
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function remove(q: any) {
    if (!canEdit) { alert('Only admins can delete/decline.'); return }
    if (!confirm(`Delete/decline quote ${q.id.slice(0, 8)}?`)) return
    try {
      // Soft-delete example: mark declined
      await updateQuoteStatus(q.id, 'declined' as Quote['status'])
      await load()
      if (detail?.id === q.id) setDetail(null)
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  async function approve(q: any) {
    if (!canEdit) { alert('Only admins can approve.'); return }
    try {
      await updateQuoteStatus(q.id, 'accepted' as Quote['status'])
      await load()
      if (detail?.id === q.id) {
        const fresh = await getQuote(q.id)
        setDetail(fresh)
      }
    } catch (e: any) {
      alert(e?.message || 'Approve failed')
    }
  }

  // pagination slice (robust to non-array)
  const { pageCount, pageRows } = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    const total = list.length
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(1, page), pageCount)
    const start = (safePage - 1) * pageSize
    return { pageCount, pageRows: list.slice(start, start + pageSize) }
  }, [rows, page, pageSize])

  return (
    <div className={`grid gap-4 ${detail ? 'xl:grid-cols-[1fr_420px]' : ''}`}>
      {/* Top bar — filters */}
      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="field field-select text-black dark:text-white"
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value as Filters['status'] })}
            title="Status"
          >
            <option value="">status: any</option>
            <option>draft</option><option>issued</option><option>accepted</option>
            <option>declined</option><option>expired</option><option>converted</option>
          </select>

          <input
            className="field flex-1 min-w-[240px]"
            placeholder="Search customer / quote id"
            value={filters.customer_q}
            onChange={e => setFilters({ ...filters, customer_q: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') load() }}
          />

          <input
            className="field"
            type="date"
            value={filters.from}
            onChange={e => setFilters({ ...filters, from: e.target.value })}
            title="From date"
          />
          <input
            className="field"
            type="date"
            value={filters.to}
            onChange={e => setFilters({ ...filters, to: e.target.value })}
            title="To date"
          />

          <div className="ml-auto flex items-center gap-2">
            <button className="btn" onClick={clearFilters}>Clear</button>
            <button className="btn-primary" onClick={load}>Apply</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead className="thead sticky top-0 z-[1]">
            <tr>
              <th className="th w-[18%]">ID</th>
              <th className="th w-[20%]">Customer</th>
              <th className="th w-[12%]">Status</th>
              <th className="th w-[12%]">Service</th>
              <th className="th w-[14%]">Timeframe</th>
              <th className="th w-[12%]">Created</th>
              <th className="th w-[12%] text-right">Total</th>
              <th className="th w-[10%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((q: any) => (
              <tr key={q.id} className="hover:bg-white/5 cursor-pointer" onClick={() => open(q.id)}>
                <td className="td">{q.id.slice(0, 8)}</td>
                <td className="td">{q.customer?.name || q.customer_name || q.customer_id}</td>

                <td className="td"><span className="badge">{q.status}</span></td>
                <td className="td">{q.service_type}</td>
                <td className="td">{q.timeframe}</td>
                <td className="td">{q.created_at ? new Date(q.created_at).toLocaleString() : '-'}</td>
                {/* FIX: number-ify before .toFixed */}
                <td className="td text-right">£{money(q.total_gross ?? q.total_net).toFixed(2)}</td>
                <td className="td">
                  <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    {canEdit ? (
                      <>
                        {(q.status === 'issued' || q.status === 'draft') && (
                          <button className="btn" title="Approve" onClick={() => approve(q)}>Approve</button>
                        )}
                        <button className="btn-ghost" title="Edit" onClick={() => openEdit(q)}>Edit</button>
                        <button className="btn-danger" title="Delete" onClick={() => remove(q)}>Del</button>
                        <button className="btn" title="Open" onClick={() => open(q.id)}>Open</button>
                      </>
                    ) : (
                      <button className="btn" title="Open" onClick={() => open(q.id)}>Open</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* states */}
        {loading && <p className="mt-2 text-reliant-muted">Loading…</p>}
        {!loading && error && <p className="mt-2 text-red-400">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="mt-2 text-reliant-muted">No quotes match that… try widening filters.</p>
        )}

        {/* pagination */}
        {Array.isArray(rows) && rows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm opacity-80">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm opacity-80">Per page</label>
              <select
                className="field field-select text-black dark:text-white w-[84px]"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              <div className="flex items-center gap-2 ml-2">
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                <span className="text-sm opacity-80">Page {page} / {pageCount}</span>
                <button className="btn" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* right drawer detail */}
      {detail && (
        <div className="card">
          <div className="flex justify-between items-start mb-2 gap-2">
            <h3 className="text-lg font-semibold">Quote {detail.id?.slice(0, 8)}</h3>
            <div className="flex items-center gap-2">
              {canEdit && (detail.status === 'issued' || detail.status === 'draft') && (
                <button className="btn" onClick={() => approve(detail)}>Approve</button>
              )}
              <button className="btn" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
          <p className="text-reliant-muted">
            Status: <b className="text-white">{detail.status}</b>
          </p>
          <p className="text-reliant-muted">
            Customer: <span className="text-white">{detail.customer?.name || detail.customer_id}</span>
          </p>
          <p className="text-reliant-muted">
            Timeframe: <span className="text-white">{detail.timeframe}</span> | Service: <span className="text-white">{detail.service_type}</span>
          </p>
          <p className="text-reliant-muted">
            Totals: <span className="text-white">£{money(detail.total_net).toFixed(2)}</span> net • VAT <span className="text-white">£{money(detail.vat_amount).toFixed(2)}</span> • Gross <span className="text-white">£{money(detail.total_gross).toFixed(2)}</span>
          </p>

          <h4 className="mt-3 font-medium">Items</h4>
          <ul className="list-disc pl-6 text-reliant-muted">
            {(detail.items || []).map((it: any, idx: number) => (
              <li key={idx}><span className="text-white">{it.description || it.product_name || it.service_name}</span> — {it.quantity} {it.uom}</li>
            ))}
          </ul>

          {detail.notes && (<><h4 className="mt-4 font-medium">Notes</h4><p className="text-reliant-muted">{detail.notes}</p></>)}
        </div>
      )}

      {/* Edit modal — shown only if admin */}
      {modalOpen && canEdit && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="w-[720px] max-w-[95vw] rounded-2xl border border-white/10 bg-reliant-panel p-5 shadow-soft"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Quote</h3>
              <button className="btn" onClick={() => setModalOpen(false)}>Close</button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm opacity-80">Status
                <select
                  className="field field-select text-black dark:text-white mt-1"
                  value={(form.status as any) || 'draft'}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                >
                  <option>draft</option><option>issued</option><option>accepted</option>
                  <option>declined</option><option>expired</option><option>converted</option>
                </select>
              </label>

              <label className="text-sm opacity-80">Service type
                <select
                  className="field field-select text-black dark:text-white mt-1"
                  value={(form.service_type as any) || 'supply_only'}
                  onChange={e => setForm({ ...form, service_type: e.target.value as any })}
                >
                  <option value="supply_only">supply_only</option>
                  <option value="supply_and_install">supply_and_install</option>
                </select>
              </label>

              <label className="text-sm opacity-80">Timeframe
                <select
                  className="field field-select text-black dark:text-white mt-1"
                  value={(form.timeframe as any) || 'asap'}
                  onChange={e => setForm({ ...form, timeframe: e.target.value as any })}
                >
                  <option value="asap">asap</option>
                  <option value="3_6_months">3_6_months</option>
                  <option value="6_12_months">6_12_months</option>
                </select>
              </label>

              <label className="text-sm opacity-80 col-span-2">Notes
                <textarea
                  className="field mt-1 h-28"
                  placeholder="Internal notes"
                  value={(form.notes as any) || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              {editing && (
                <button className="btn-danger" onClick={() => remove(editing)}>Delete</button>
              )}
              <button className="btn-primary" onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* local styles (kept same as before) */}
      <style>{`
        .field-select { background-color: rgba(255,255,255,0.06); }
        .field-select option { color: #111 !important; background: #fff !important; }

        .badge { padding: .18rem .45rem; border-radius: .35rem;
                 border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06);
                 text-transform: uppercase; font-size: .68rem; letter-spacing: .03em; }

        .btn { border: 1px solid rgba(255,255,255,.15); padding: .45rem .7rem; border-radius: .55rem; }
        .btn-primary { border: 1px solid rgba(255,255,255,.25); padding: .45rem .7rem; border-radius: .55rem; background: rgba(255,255,255,.08); }
        .btn-ghost { padding: .25rem .5rem; border-radius: .45rem; border: 1px solid rgba(255,255,255,.12); background: transparent; }
        .btn-ghost:hover { background: rgba(255,255,255,.06); }
        .btn-danger { padding: .25rem .6rem; border-radius: .45rem; border: 1px solid rgba(244,63,94,.35); background: rgba(244,63,94,.13); }
        .btn-danger:hover { background: rgba(244,63,94,.18); }

        .table { width: 100%; border-collapse: separate; border-spacing: 0 }
        .thead th.th { text-align: left; font-weight: 600; padding: .6rem .75rem; border-bottom: 1px solid rgba(255,255,255,.12) }
        .td { padding: .55rem .75rem; border-bottom: 1px solid rgba(255,255,255,.06) }
      `}</style>
    </div>
  )
}
