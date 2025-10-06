/// <reference types="node" />
/// In-memory fake DB for route tests (customers + quotes).
/// It ignores SQL specifics and returns plausible rows.

type Customer = {
  id: string;
  name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  postcode?: string | null;
  site_postcode?: string | null;
  customer_type?: 'homeowner' | 'trade' | 'company';
  satisfaction?: number | null;
  total_purchases?: number | null;
  interaction_channel?: string | null;
  created_at?: string;
};

type QuoteStatus = 'draft' | 'issued' | 'accepted' | 'declined' | 'expired' | 'converted';
type Quote = {
  id: string;
  customer_id: string;
  status: QuoteStatus;
  service_type: 'supply_only' | 'supply_and_install';
  timeframe: 'asap' | '3_6_months' | '6_12_months';
  channel?: string | null;
  site_postcode?: string | null;
  notes?: string | null;
  base_cost?: number;
  material_cost?: number;
  labour_cost?: number;
  overhead_cost?: number;
  timeline_cost?: number;
  transport_cost?: number;
  service_fee?: number;
  ai_pred_cost?: number | null;
  discount_pct?: number;
  vat_percent?: number;
  vat_amount?: number;
  total_net?: number;
  total_gross?: number;
  created_at?: string;
};

const store = {
  customers: new Map<string, Customer>(),
  quotes: new Map<string, Quote>(),
};

const statuses: QuoteStatus[] = ['draft', 'issued', 'accepted', 'declined', 'expired', 'converted'];
const last = <T>(arr: T[]) => arr[arr.length - 1];
const nowISO = () => new Date().toISOString();

function rid() {
  try {
    // @ts-ignore node18+
    return global?.crypto?.randomUUID?.() ?? `id_${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `id_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function touches(sql: string, tbl: 'customers' | 'quotes') {
  const s = ` ${sql.toLowerCase()} `;
  return (
    s.includes(` ${tbl} `) ||
    s.includes(` ${tbl}(`) ||
    s.includes(` from ${tbl} `) ||
    s.includes(` into ${tbl} `) ||
    s.includes(` update ${tbl} `) ||
    s.includes(` join ${tbl} `) ||
    s.includes(` public.${tbl} `) ||
    s.includes(` "${tbl}" `)
  );
}

function pickIdParam(params: any[]): string | null {
  if (params.length === 2) {
    const [a, b] = params;
    if (typeof a === 'string' && statuses.includes(a as QuoteStatus)) return String(b);
    if (typeof b === 'string' && statuses.includes(b as QuoteStatus)) return String(a);
  }
  const uuidLike = params.find((v) => typeof v === 'string' && /[a-f0-9-]{16,}/i.test(v));
  if (uuidLike) return String(uuidLike);
  return params.length ? String(last(params)) : null;
}

function rowArray<T>(iter: Iterable<T>) {
  return Array.from(iter);
}

// Seed one customer
const seedId = rid();
store.customers.set(seedId, {
  id: seedId,
  name: 'API Test',
  contact_name: 'API Test',
  email: 'apitest@example.com',
  phone: '07123456789',
  site_postcode: 'B5 1AE',
  postcode: 'B5 1AE',
  customer_type: 'homeowner',
  satisfaction: 4,
  total_purchases: 1,
  interaction_channel: 'website',
  created_at: nowISO(),
});

export const db = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const s = (sql || '').toLowerCase().trim();

    // CUSTOMERS
    if (touches(s, 'customers')) {
      if (s.startsWith('select')) {
        const idParam = params?.[0];
        if (s.includes(' where ') && idParam) {
          const row = store.customers.get(String(idParam));
          return (row ? [row] : []) as T[];
        }
        return rowArray(store.customers.values()) as T[];
      }

      if (s.startsWith('insert')) {
        const row: Customer = {
          id: rid(),
          created_at: nowISO(),
        };

        if (params.length >= 5) {
          row.customer_type = params[0] ?? 'homeowner';
          row.contact_name = params[1] ?? 'Test User';
          row.name = row.contact_name;
          row.email = params[2] ?? null;
          row.phone = params[3] ?? null;
          row.site_postcode = params[4] ?? null;
          row.postcode = row.site_postcode;
        } else {
          row.name = params[0] ?? 'Test User';
          row.email = params[1] ?? null;
          row.phone = params[2] ?? null;
          row.postcode = params[3] ?? null;
        }

        store.customers.set(row.id, row);
        return [row] as T[];
      }

      if (s.startsWith('update')) {
        const id = pickIdParam(params);
        if (!id) return [] as T[];
        const cur = store.customers.get(id);
        if (!cur) return [] as T[];

        const maybeName = params.find((v) => typeof v === 'string' && v !== id && !statuses.includes(v as any)) as
          | string
          | undefined;

        const updated: Customer = {
          ...cur,
          contact_name: maybeName ?? cur.contact_name ?? cur.name ?? 'Customer',
          name: maybeName ?? cur.name ?? cur.contact_name ?? 'Customer',
        };
        store.customers.set(id, updated);
        return [updated] as T[];
      }

      if (s.startsWith('delete')) {
        const id = String(params[0]);
        const ok = store.customers.delete(id);
        return ok ? ([{ success: true }] as any) : ([] as T[]);
      }
    }

    // QUOTES
    if (touches(s, 'quotes')) {
      if (s.startsWith('select')) {
        const idParam = params?.[0];
        if (s.includes(' where ') && idParam) {
          const row = store.quotes.get(String(idParam));
          return (row ? [row] : []) as T[];
        }
        return rowArray(store.quotes.values()) as T[];
      }

      if (s.startsWith('insert')) {
        const row: Quote = {
          id: rid(),
          created_at: nowISO(),
          customer_id: String(params[0] ?? seedId),
          service_type: params[1] ?? 'supply_and_install',
          timeframe: params[2] ?? 'asap',
          channel: params[3] ?? 'website',
          status: params[4] ?? 'draft',
          site_postcode: params[5] ?? null,
          notes: params[6] ?? null,
          material_cost: Number(params[7] ?? 0),
          labour_cost: Number(params[8] ?? 0),
          overhead_cost: Number(params[9] ?? 0),
          transport_cost: Number(params[10] ?? 0),
          service_fee: Number(params[11] ?? 0),
          base_cost: 0,
          vat_percent: 20,
          vat_amount: 0,
          discount_pct: 0,
          total_net: 0,
          total_gross: 0,
        };

        store.quotes.set(row.id, row);
        return [row] as T[];
      }

      if (s.startsWith('update')) {
        const id = pickIdParam(params);
        if (!id) return [] as T[];
        const cur = store.quotes.get(id);
        if (!cur) return [] as T[];

        const maybeStatus = params.find((v) => typeof v === 'string' && statuses.includes(v as QuoteStatus)) as
          | QuoteStatus
          | undefined;

        const updated: Quote = { ...cur, status: maybeStatus ?? cur.status };
        store.quotes.set(id, updated);
        return [updated] as T[];
      }
    }

    // Default
    return [] as T[];
  },
};

// pg-like helpers
export async function query<T = any>(text: string, params: any[] = []) {
  const rows = await db.query<T>(text, params);
  return rows as T[];
}

export const pool = {
  async query<T = any>(text: string, params: any[] = []) {
    const rows = await db.query<T>(text, params);
    return { rows } as { rows: T[] };
  },
  async end() {},
};

export default { db, pool, query };
