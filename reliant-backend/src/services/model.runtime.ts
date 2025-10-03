// src/services/model.runtime.ts
import * as ort from "onnxruntime-node";
import fs from "node:fs";
import path from "node:path";

/**
 * Model Runtime (pricing)
 * -----------------------
 * Responsibilities:
 *  - Load ONNX residual model (lazy, cached)
 *  - Load similarity index + bucket stats (JSON, cached)
 *  - Provide a blended residual estimator: bucket + kNN + ONNX
 *  - Expose a numeric-vector API for legacy/base models
 *
 * Keep I/O here; upstream services/controllers stay clean.
 */

/** =========================
 * Types
 * ========================== */
export type ResidualFeatures = {
  service_type: string;
  timeframe: string;
  channel: string;
  postcode_area: string;
  customer_interaction_channel: string;
  qty_sum: number;
  line_count: number;
  customer_satisfaction: number;
  customer_total_purchases: number;
};

type SimilarIndex = {
  version: number;
  k: number;
  // key -> [[qty_sum, line_count, residual], ...]
  buckets: Record<string, number[][]>;
};

type BucketStats = {
  version: number;
  global_mean: number;
  // key -> { n, mean, shrink_mean }
  buckets: Record<string, { n: number; mean: number; shrink_mean: number }>;
};

/** =========================
 * Env & Paths
 * ========================== */
// NOTE: Model dir defaults to CWD for dev. Override via env in prod.
function modelDir() {
  return process.env.PRICING_MODEL_DIR || process.cwd();
}
function onnxPath() {
  return (
    process.env.PRICING_MODEL_PATH ||
    path.resolve(modelDir(), "models", "pricing_residual.onnx")
  );
}
function simIndexPath() {
  return (
    process.env.PRICING_SIMILAR_PATH ||
    path.resolve(modelDir(), "models", "similarity_index.json")
  );
}
function bucketStatsPath() {
  return (
    process.env.PRICING_BUCKET_PATH ||
    path.resolve(modelDir(), "models", "bucket_stats.json")
  );
}

/** Blend weights: bucket, knn, onnx  (defaults 0.70, 0.25, 0.05) */
// TIP: Set PRICING_BLEND="0.6,0.3,0.1" to tweak without code changes.
const BLEND_WEIGHTS = (() => {
  const s = process.env.PRICING_BLEND || "0.70,0.25,0.05";
  const [wb, wk, wo] = s.split(",").map((x) => Number(x.trim()));
  const arr = [wb, wk, wo].map((x) => (Number.isFinite(x) && x >= 0 ? x : 0));
  const sum = arr.reduce((a, b) => a + b, 0) || 1;
  return { wb: arr[0] / sum, wk: arr[1] / sum, wo: arr[2] / sum };
})();

/** =========================
 * Caches
 * ========================== */
// Keep singletons in-memory; safe for a single node process.
// If you run multiple workers, each will have its own cache.
let session: ort.InferenceSession | null = null;
let simIndex: SimilarIndex | null = null;
let bucketStats: BucketStats | null = null;

/** =========================
 * Loaders
 * ========================== */
// Try a couple of EP names for cross-platform stability.
async function createSession(p: string): Promise<ort.InferenceSession> {
  try {
    return await ort.InferenceSession.create(p, {
      executionProviders: ["cpuExecutionProvider"],
    } as any);
  } catch {
    try {
      return await ort.InferenceSession.create(p, {
        executionProviders: ["cpu"],
      } as any);
    } catch {
      return await ort.InferenceSession.create(p);
    }
  }
}

export async function ensureModelLoaded(): Promise<boolean> {
  if (session) return true;
  const p = onnxPath();
  if (!fs.existsSync(p)) {
    console.warn("[pricing] ONNX model not found:", p);
    return false;
  }
  try {
    session = await createSession(p);
    console.log("[pricing] ONNX model loaded:", p);
    return true;
  } catch (e) {
    session = null;
    console.warn("[pricing] Failed to load ONNX model:", e);
    return false;
  }
}

function ensureSimilarIndexLoaded(): boolean {
  if (simIndex) return true;
  const p = simIndexPath();
  if (!fs.existsSync(p)) {
    console.warn("[pricing] similarity index not found:", p);
    return false;
  }
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as SimilarIndex;
    if (
      typeof json.version !== "number" ||
      typeof json.k !== "number" ||
      typeof json.buckets !== "object"
    ) {
      throw new Error("Invalid similarity_index.json shape");
    }
    simIndex = json;
    console.log(
      "[pricing] similarity index loaded:",
      p,
      `buckets=${Object.keys(simIndex.buckets).length}`
    );
    return true;
  } catch (e) {
    simIndex = null;
    console.warn("[pricing] failed to load similarity index:", e);
    return false;
  }
}

function ensureBucketStatsLoaded(): boolean {
  if (bucketStats) return true;
  const p = bucketStatsPath();
  if (!fs.existsSync(p)) {
    console.warn("[pricing] bucket stats not found:", p);
    return false;
  }
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as BucketStats;
    if (
      typeof json.version !== "number" ||
      typeof json.global_mean !== "number" ||
      typeof json.buckets !== "object"
    ) {
      throw new Error("Invalid bucket_stats.json shape");
    }
    bucketStats = json;
    console.log(
      "[pricing] bucket stats loaded:",
      p,
      `buckets=${Object.keys(bucketStats.buckets).length}`
    );
    return true;
  } catch (e) {
    bucketStats = null;
    console.warn("[pricing] failed to load bucket stats:", e);
    return false;
  }
}

/** =========================
 * Residual estimators
 * ========================== */
// Key granularity: service_type|timeframe|channel|postcode_area
function bucketKey(f: ResidualFeatures) {
  return [f.service_type, f.timeframe, f.channel, f.postcode_area].join("|");
}

// 1) Bucket mean with shrinkage → fast, stable prior
function bucketResidual(f: ResidualFeatures): number | null {
  if (!ensureBucketStatsLoaded() || !bucketStats) return null;
  const key = bucketKey(f);
  const b = bucketStats.buckets[key];
  if (b && Number.isFinite(b.shrink_mean)) return b.shrink_mean;
  return Number.isFinite(bucketStats.global_mean) ? bucketStats.global_mean : null;
}

// 2) kNN on (qty_sum, line_count) within the same bucket
function knnResidual(f: ResidualFeatures): number | null {
  if (!ensureSimilarIndexLoaded() || !simIndex) return null;
  const key = bucketKey(f);
  const pts = simIndex.buckets[key];
  if (!pts || !pts.length) return null;

  const k = Math.min(simIndex.k || 5, pts.length);
  const Q = Number(f.qty_sum) || 0;
  const L = Number(f.line_count) || 0;

  const top = pts
    .map(([q, l, r]) => {
      const dq = q - Q;
      const dl = l - L;
      const d = Math.sqrt(dq * dq + dl * dl);
      return { d, r };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, k);

  // Distance-weighted average (1/d). If exact match, give huge weight.
  let num = 0,
    den = 0;
  for (const { d, r } of top) {
    const w = d === 0 ? 1e6 : 1 / d;
    num += w * r;
    den += w;
  }
  if (den <= 0) return null;
  const est = num / den;
  return Number.isFinite(est) ? est : null;
}

// 3) ONNX model for residuals (string + float inputs)
async function onnxResidual(f: ResidualFeatures): Promise<number | null> {
  if (!(await ensureModelLoaded()) || !session) return null;

  const str = (v: string) =>
    new ort.Tensor("string", [typeof v === "string" ? v : ""], [1, 1]);
  const flt = (v: number) =>
    new ort.Tensor("float32", new Float32Array([Number(v) || 0]), [1, 1]);

  const inputs: Record<string, ort.Tensor> = {
    service_type: str(f.service_type),
    timeframe: str(f.timeframe),
    channel: str(f.channel),
    postcode_area: str(f.postcode_area),
    customer_interaction_channel: str(f.customer_interaction_channel || ""),
    qty_sum: flt(f.qty_sum),
    line_count: flt(f.line_count),
    customer_satisfaction: flt(f.customer_satisfaction),
    customer_total_purchases: flt(f.customer_total_purchases),
  };

  try {
    const out = await session.run(inputs);
    const outName =
      session.outputNames?.[0] ?? Object.keys(out)[0] ?? "output";
    const data = out[outName]?.data as Float32Array | number[] | undefined;
    if (!data) return null;
    const raw =
      Array.isArray(data) ? Number(data[0]) : Number((data as Float32Array)[0]);
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, raw); // keep non-negative residuals
  } catch (e) {
    console.warn("[pricing] ONNX residual inference failed:", e);
    return null;
  }
}

/** Public: blended residual (bucket + kNN + ONNX) */
// NOTE: If none are available, returns null so caller can fallback.
export async function predictResidual(
  features: ResidualFeatures
): Promise<number | null> {
  const b = bucketResidual(features);
  const k = knnResidual(features);
  const o = await onnxResidual(features);

  const parts: Array<{ v: number; w: number }> = [];
  if (b != null) parts.push({ v: b, w: BLEND_WEIGHTS.wb });
  if (k != null) parts.push({ v: k, w: BLEND_WEIGHTS.wk });
  if (o != null) parts.push({ v: o, w: BLEND_WEIGHTS.wo });

  if (!parts.length) return null;

  const wsum = parts.reduce((s, p) => s + p.w, 0) || 1;
  const blended = parts.reduce((s, p) => s + p.v * (p.w / wsum), 0);
  return Math.max(0, blended);
}

/** =========================
 * Back-compat numeric-vector API
 * ========================== */
/**
 * Build a fixed-order numeric feature vector (for models that take a single float input).
 * Mirrors what pricing.service.ts expects.
 */
export function buildFeatures(input: {
  qty_sum: number;
  items_len: number;
  is_install: number;
  timeframe_asap: number;
  timeframe_3_6: number;
  timeframe_6_12: number;
  ch_website: number;
  ch_phone: number;
  ch_social: number;
  ch_showroom: number;
  ch_whatsapp: number;
}) {
  const order = [
    "qty_sum",
    "items_len",
    "is_install",
    "timeframe_asap",
    "timeframe_3_6",
    "timeframe_6_12",
    "ch_website",
    "ch_phone",
    "ch_social",
    "ch_showroom",
    "ch_whatsapp",
  ] as const;

  // Caller passes a plain object; we build [1, n] float32 tensor.
  const tensor = Float32Array.from(order.map((k) => (input as any)[k] ?? 0));
  return { order, tensor };
}

/**
 * Predict a scalar from a single numeric input tensor [1, n].
 * If the loaded model expects multiple named inputs (residual model),
 * we bail and return null so the caller can fallback.
 */
export async function predictBase(
  featuresTensor: Float32Array
): Promise<number | null> {
  if (!(await ensureModelLoaded()) || !session) return null;

  try {
    const inputNames = session.inputNames || [];
    // Residual model exposes multiple named inputs → not compatible with this path.
    if (inputNames.length !== 1) return null;

    const inputName = inputNames[0];
    const tensor = new ort.Tensor("float32", featuresTensor, [
      1,
      featuresTensor.length,
    ]);

    const out = await session.run({ [inputName]: tensor });
    const outName =
      session.outputNames?.[0] ?? Object.keys(out)[0] ?? "output";
    const data = out[outName]?.data as Float32Array | number[] | undefined;
    if (!data) return null;

    const val =
      Array.isArray(data) ? Number(data[0]) : Number((data as Float32Array)[0]);
    return Number.isFinite(val) ? val : null;
  } catch (e) {
    console.warn("[pricing] ONNX numeric inference failed:", e);
    return null;
  }
}

/** =========================
 * Dev helpers
 * ========================== */
// Clear all caches—useful for hot reloads or model swaps.
export function resetModelCaches(): void {
  session = null;
  simIndex = null;
  bucketStats = null;
  console.log("[pricing] model caches reset");
}

// Quick health snapshot for /health or admin tools.
export function modelHealth() {
  return {
    onnx_loaded: !!session,
    similar_loaded: !!simIndex,
    bucket_loaded: !!bucketStats,
    model_path: onnxPath(),
    simidx_path: simIndexPath(),
    bucket_path: bucketStatsPath(),
    blend: BLEND_WEIGHTS,
    inputStyle:
      session?.inputNames?.length === 1
        ? "single-float-vector"
        : `${session?.inputNames?.length || 0}-input-named`,
  };
}
