// src/lib/api/http.ts

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const isGetLike = (m: HttpMethod) => m === "GET";

type Primitive = string | number | boolean | null | undefined;
type Query = Record<string, Primitive>;

export type HttpOptions = {
  method?: HttpMethod;          // default GET
  path: string;                 // e.g. "/api/customers" (Vite proxy) or "http://localhost:3000/api/customers"
  query?: Query;                // appended as ?a=b&c=d (merged with any query already on path)
  body?: any;                   // JSON body, FormData, Blob, etc.
  init?: RequestInit;           // extra fetch options/headers
};

/**
 * API base:
 * - Leave empty string "" to use Vite dev proxy (recommended).
 * - Or set VITE_API_BASE = "http://localhost:3000" to bypass proxy.
 * TIP: exporting API_BASE at bottom helps with debugging.
 */
const API_BASE: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) ?? "";

/** Ensure base + path join without accidental double slashes */
function joinBasePath(base: string, path: string): string {
  if (!base) return path.startsWith("/") ? path : `/${path}`;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Build a URL with base + path + query.
 * Preserves any existing query on `path` and merges with provided `query`.
 */
function buildUrl(path: string, query?: Query): string {
  if (typeof path !== "string" || !path) {
    const got = path === undefined ? "undefined" : JSON.stringify(path);
    throw new Error(`http(): 'path' must be a non-empty string. Got: ${got}`);
  }

  // If absolute URL, don't prepend base
  const isAbsolute = /^https?:\/\//i.test(path);
  let urlStr = isAbsolute ? path : joinBasePath(API_BASE, path);

  if (!query || Object.keys(query).length === 0) return urlStr;

  // Merge existing query params with provided "query"
  const url = new URL(urlStr, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const qs = url.searchParams;

  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue; // skip empties
    qs.set(k, String(v));
  }

  url.search = qs.toString();
  return url.toString();
}

// Type guards for body detection (so we don't force JSON headers wrongly)
function isFormDataLike(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}
function isBlobLike(body: unknown): body is Blob {
  return typeof Blob !== "undefined" && body instanceof Blob;
}
function isArrayBufferLike(body: unknown): body is ArrayBuffer | Uint8Array {
  return body instanceof ArrayBuffer || body instanceof Uint8Array;
}

/**
 * Try to parse response as JSON when it looks like JSON,
 * otherwise return raw text. Empty body → {} for convenience.
 */
async function parseResponse(res: Response, rawText: string) {
  if (rawText === "") return {};
  const ctype = res.headers.get("content-type") || "";
  const looksJson = ctype.includes("application/json") || /^[\s\n\r]*[{\[]/.test(rawText);
  if (!looksJson) return rawText;
  try {
    return JSON.parse(rawText);
  } catch {
    // If parsing fails but content smells like JSON, just return the text.
    return rawText;
  }
}

/** Narrow union of supported call signatures */
export function http<T = any>(options: HttpOptions): Promise<T>;
export function http<T = any>(method: HttpMethod, path: string, body?: any, init?: RequestInit): Promise<T>;

/**
 * Implementation supporting BOTH signatures:
 *  - Object style: http({ method, path, query, body, init })
 *  - Tuple style:  http("POST", "/api/x", payload, { headers: {...} })
 */
export async function http<T = any>(...args: any[]): Promise<T> {
  let method: HttpMethod;
  let url: string;
  let body: any;
  let init: RequestInit | undefined;

  if (typeof args[0] === "object" && args.length === 1) {
    // Object style
    const opts = args[0] as HttpOptions;
    method = (opts.method ?? "GET") as HttpMethod;
    url = buildUrl(opts.path, opts.query);
    body = opts.body;
    init = opts.init;
  } else {
    // Tuple style
    method = args[0] as HttpMethod;
    url = buildUrl(args[1] as string);
    body = args[2];
    init = args[3];
  }

  // Merge headers safely (caller headers win when applied last in fetchInit)
  const { headers: initHeaders, ...restInit } = init ?? {};
  const headers: HeadersInit = { Accept: "application/json", ...(initHeaders || {}) };

  // Only set JSON content-type automatically if body isn't FormData/Blob/Binary
  const shouldJson =
    !isGetLike(method) &&
    body != null &&
    !isFormDataLike(body) &&
    !isBlobLike(body) &&
    !isArrayBufferLike(body);

  if (shouldJson && (headers as any)["Content-Type"] == null) {
    (headers as any)["Content-Type"] = "application/json";
  }

  const fetchInit: RequestInit = {
    method,
    headers,
    ...(!isGetLike(method) && body != null
      ? shouldJson
        ? { body: JSON.stringify(body) }
        : { body }
      : {}),
    ...restInit, // apply last so caller can override anything (credentials, mode, etc.)
  };

  // NOTE: You can plug in AbortController via init.signal for timeouts/cancels.
  const res = await fetch(url, fetchInit);
  const text = await res.text().catch(() => "");

  const data = await parseResponse(res, text);

  if (!res.ok) {
    // Preserve server-provided error payload when possible
    const detail = (data && (data.error || data.message)) || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(detail) as Error & { status?: number; url?: string; data?: any };
    err.status = res.status;
    err.url = url;
    err.data = data;
    throw err;
  }

  return data as T;
}

/** Convenience helpers (sugar) */
export const get   = <T = any>(path: string, query?: Query, init?: RequestInit) =>
  http<T>({ method: "GET", path, query, init });

export const post  = <T = any>(path: string, body?: any, init?: RequestInit) =>
  http<T>({ method: "POST", path, body, init });

export const put   = <T = any>(path: string, body?: any, init?: RequestInit) =>
  http<T>({ method: "PUT", path, body, init });

export const patch = <T = any>(path: string, body?: any, init?: RequestInit) =>
  http<T>({ method: "PATCH", path, body, init });

export const del   = <T = any>(path: string, query?: Query, init?: RequestInit) =>
  http<T>({ method: "DELETE", path, query, init });

// Optional: export API_BASE for debugging or external usage
export { API_BASE };
