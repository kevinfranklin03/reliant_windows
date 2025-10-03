import React from "react";
import Star from "./Star";
import type { Customer } from "../../lib/api/types";

type Props = {
  rows: Customer[];
  pageRows: Customer[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  pageCount: number;
  setPage: (n: number | ((p: number) => number)) => void;
  setPageSize: (n: number) => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
};

export default function CustomerTable({
  rows,
  pageRows,
  loading,
  error,
  page,
  pageSize,
  pageCount,
  setPage,
  setPageSize,
  onEdit,
  onDelete,
}: Props) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, rows.length);

  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <caption className="sr-only">Customers</caption>
        <thead className="thead sticky top-0 z-[1]">
          <tr>
            <th className="th w-[22%]" scope="col">Name</th>
            <th className="th w-[20%]" scope="col">Email</th>
            <th className="th w-[16%]" scope="col">Phone</th>
            <th className="th w-[14%]" scope="col">Satisfaction</th>
            <th className="th w-[14%]" scope="col">Channel</th>
            <th className="th w-[8%]" scope="col">Postcode</th>
            <th className="th w-[6%] text-right" scope="col">Actions</th>
          </tr>
        </thead>

        <tbody>
          {pageRows.length === 0 && rows.length > 0 && !loading && !error && (
            <tr>
              <td className="td" colSpan={7}>
                <p className="text-reliant-muted">
                  No rows on this page. Try the previous/next page or adjust filters.
                </p>
              </td>
            </tr>
          )}

          {pageRows.map((c) => (
            <tr
              key={c.id}
              className="hover:bg-white/5 cursor-pointer"
              onClick={() => onEdit(c)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEdit(c);
                }
              }}
              aria-label={`Edit customer ${c.name}`}
            >
              <td className="td">{c.name}</td>

              <td className="td">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="underline underline-offset-2">
                    {c.email}
                  </a>
                ) : (
                  "-"
                )}
              </td>

              <td className="td">
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="underline underline-offset-2">
                    {c.phone}
                  </a>
                ) : (
                  "-"
                )}
              </td>

              <td className="td">
                <span
                  title={`${c.satisfaction ?? 0} / 5`}
                  className="inline-flex items-center"
                  aria-label={`Satisfaction ${c.satisfaction ?? 0} out of 5`}
                >
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} filled={i <= (c.satisfaction ?? 0)} />
                  ))}
                </span>
              </td>

              <td className="td">{c.interaction_channel || "-"}</td>
              <td className="td">{c.postcode || "-"}</td>

              <td className="td">
                <div
                  className="flex items-center justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="btn-ghost"
                    title="Edit"
                    onClick={() => onEdit(c)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    title="Delete"
                    onClick={() => onDelete(c)}
                  >
                    Del
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loading && <p className="mt-2 text-reliant-muted">Loading…</p>}
      {!loading && error && <p className="mt-2 text-red-400">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="mt-2 text-reliant-muted">
          No customers match that… try widening filters.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm opacity-80">
            Showing {start}–{end} of {rows.length}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80" htmlFor="per-page">
              Per page
            </label>
            <select
              id="per-page"
              className="field field-select text-black dark:text-white w-[84px]"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              disabled={loading}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-2">
              <button
                className="btn"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, Number(p) - 1))}
              >
                Prev
              </button>
              <span className="text-sm opacity-80">
                Page {page} / {pageCount}
              </span>
              <button
                className="btn"
                disabled={loading || page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, Number(p) + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
