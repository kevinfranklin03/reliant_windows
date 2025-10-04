"""
train_pricing_model_v2.py (no CLI)
----------------------------------
Loads CSV paths from code (with optional ENV overrides), then trains the improved model:
- Uses Empirical-Bayes bucket shrink mean as a feature (strong prior)
- GradientBoostingRegressor(loss='absolute_error') for robust MAE optimisation
- Leak-proof OOF: shrink feature computed from TRAIN fold only
- Exports PKL, (best-effort) ONNX, metrics.json, predictions.csv, bucket_mae.csv,
  bucket_stats.json, similarity_index.json
"""

from pathlib import Path
import os
import json
import warnings
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

# ---------- CONFIG: point these to your files ----------
# You can leave these as-is if your repo has data/quotes.csv etc.
# Windows paths: keep r"..." to avoid backslash escapes.
DEFAULT_QUOTES_CSV = Path(os.getenv("QUOTES_CSV") or r"C:\Users\kevin\OneDrive\Desktop\personal-projects\reliant_windows\reliant-backend\ml\quotes.csv")
DEFAULT_CUSTOMERS_CSV = Path(os.getenv("CUSTOMERS_CSV") or r"C:\Users\kevin\OneDrive\Desktop\personal-projects\reliant_windows\reliant-backend\ml\customers.csv")
DEFAULT_OUT_DIR = Path(os.getenv("OUT_DIR") or r"C:\Users\kevin\OneDrive\Desktop\personal-projects\reliant_windows\reliant-backend\models_v2")
# ------------------------------------------------------

# Optional ONNX export (guarded)
try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType, StringTensorType
    ONNX_OK = True
except Exception:
    ONNX_OK = False

# ---------------- helpers ----------------
def postcode_area(pc: str) -> str:
    if not isinstance(pc, str) or not pc.strip():
        return ""
    return pc.strip().split()[0].upper()

def rmse(y_true, y_pred):
    y_true = np.asarray(y_true, float); y_pred = np.asarray(y_pred, float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

def mape_safe(y_true, y_pred, eps=1e-6):
    y_true = np.asarray(y_true, float); y_pred = np.asarray(y_pred, float)
    denom = np.maximum(np.abs(y_true), eps)
    return float(np.mean(np.abs((y_true - y_pred) / denom))) * 100.0

def build_df(quotes_csv: Path, customers_csv: Path) -> pd.DataFrame:
    if not quotes_csv.exists():
        raise FileNotFoundError(f"quotes_csv not found: {quotes_csv}")
    if not customers_csv.exists():
        raise FileNotFoundError(f"customers_csv not found: {customers_csv}")

    q = pd.read_csv(quotes_csv)
    c = pd.read_csv(customers_csv)

    c = c.rename(columns={
        "id":"cust_id",
        "satisfaction":"customer_satisfaction",
        "total_purchases":"customer_total_purchases",
        "postcode":"customer_postcode",
        "interaction_channel":"customer_interaction_channel",
    })

    q["postcode_area"] = q["site_postcode"].fillna("").map(postcode_area)

    df = q.merge(
        c[["cust_id","customer_satisfaction","customer_total_purchases",
           "customer_postcode","customer_interaction_channel"]],
        left_on="customer_id", right_on="cust_id", how="left"
    )

    # numeric safety
    num_cols = ["base_cost","material_cost","labour_cost","overhead_cost",
                "timeline_cost","transport_cost","service_fee","total_net"]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # baseline subtotal & residual target (clipped at 0)
    df["baseline_subtotal"] = (
        df["base_cost"] + df["material_cost"] + df["labour_cost"] +
        df["overhead_cost"] + df["timeline_cost"] + df["transport_cost"] +
        df["service_fee"]
    )
    df["residual"] = (df["total_net"] - df["baseline_subtotal"]).clip(lower=0.0)

    # engineered proxies (until per-item agg is available)
    df["qty_sum"]    = (df["material_cost"] / 25.0).clip(lower=0.0)
    df["line_count"] = np.maximum(1.0, df["labour_cost"] / 35.0)

    return df

def compute_bucket_key(df_like: pd.DataFrame) -> pd.Series:
    return (
        df_like["service_type"].astype(str) + "|" +
        df_like["timeframe"].astype(str) + "|" +
        df_like["channel"].astype(str) + "|" +
        df_like["postcode_area"].astype(str)
    )

def build_bucket_stats(df: pd.DataFrame) -> dict:
    """Empirical-Bayes shrinkage of per-bucket means toward global mean."""
    df = df.copy()
    df["bucket"] = compute_bucket_key(df)

    g = df.groupby("bucket", as_index=False)["residual"].agg(["mean","var","count"]).reset_index()
    g = g.rename(columns={"mean":"mean_residual", "var":"var_residual", "count":"n"}).fillna(0.0)

    global_mean = float(df["residual"].mean())
    tau2 = float(np.var(g["mean_residual"].values, ddof=1)) if len(g) > 1 else 0.0
    tau2 = max(tau2, 1e-6)
    global_sigma2 = float(df["residual"].var(ddof=1)) if len(df) > 1 else 0.0
    global_sigma2 = max(global_sigma2, 1e-6)

    buckets = {}
    for _, row in g.iterrows():
        b = str(row["bucket"])
        n = float(row["n"])
        mean_b = float(row["mean_residual"])
        sigma2 = float(row["var_residual"]) if row["var_residual"] > 0 else global_sigma2
        lam = sigma2 / tau2
        alpha = n / (n + lam) if (n + lam) > 0 else 0.0
        shrink_mean = alpha * mean_b + (1 - alpha) * global_mean
        buckets[b] = {"n": n, "mean": mean_b, "shrink_mean": shrink_mean}

    return {"version": 1, "global_mean": global_mean, "buckets": buckets}

def map_shrink_mean(bucket_key: pd.Series, shrink_payload: dict) -> np.ndarray:
    bmap = shrink_payload["buckets"]; gmean = shrink_payload["global_mean"]
    return bucket_key.map(lambda b: float(bmap.get(b, {}).get("shrink_mean", gmean))).values

def build_similarity_index(df: pd.DataFrame, out_path: Path, max_points_per_bucket: int = 200):
    df = df.copy()
    df["bucket"] = compute_bucket_key(df)
    buckets = {}
    for b, g in df.groupby("bucket", as_index=True):
        pts = g[["qty_sum","line_count","residual"]].dropna()
        if len(pts) > max_points_per_bucket:
            pts = pts.sample(max_points_per_bucket, random_state=42)
        buckets[b] = pts.to_numpy(dtype=float).tolist()
    payload = { "version": 1, "k": 5, "buckets": buckets }
    out_path.write_text(json.dumps(payload))

def evaluate_cv_oof_with_bucket_feature(df: pd.DataFrame, cat_cols, num_cols, out_dir: Path):
    """KFold OOF where 'bucket_shrink_mean' feature is computed on TRAIN folds only."""
    X_base = df[cat_cols + num_cols].copy()
    y = df["residual"].astype(float).values
    buckets_all = compute_bucket_key(df).values

    k = min(5, len(df))
    cv = KFold(n_splits=k, shuffle=True, random_state=42)

    y_pred_oof = np.zeros_like(y, dtype=float)
    per_bucket_records = []

    gbdt = GradientBoostingRegressor(
        loss="absolute_error",
        n_estimators=500,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.9,
        random_state=42,
    )

    for fold_idx, (tr, va) in enumerate(cv.split(X_base), 1):
        Xtr = X_base.iloc[tr].copy()
        Xva = X_base.iloc[va].copy()
        ytr = y[tr]

        shrink_payload_tr = build_bucket_stats(df.iloc[tr].copy())
        bucket_tr = compute_bucket_key(df.iloc[tr])
        bucket_va = compute_bucket_key(df.iloc[va])
        Xtr["bucket_shrink_mean"] = map_shrink_mean(bucket_tr, shrink_payload_tr)
        Xva["bucket_shrink_mean"] = map_shrink_mean(bucket_va, shrink_payload_tr)

        pre = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
                ("num", "passthrough", num_cols + ["bucket_shrink_mean"]),
            ],
            remainder="drop",
            verbose_feature_names_out=False,
        )
        pipe = Pipeline([("pre", pre), ("model", gbdt)])

        pipe.fit(Xtr, ytr)
        yhat = pipe.predict(Xva)
        yhat = np.maximum(0.0, yhat)  # residuals must be >= 0
        y_pred_oof[va] = yhat

        b_va = bucket_va.values
        df_tmp = pd.DataFrame({"bucket": b_va, "y": y[va], "yhat": yhat})
        g_mae = df_tmp.groupby("bucket", as_index=False).apply(
            lambda g: pd.Series({"mae": mean_absolute_error(g["y"], g["yhat"])})
        ).reset_index(drop=True)
        g_mae["fold"] = fold_idx
        per_bucket_records.append(g_mae)

    mae = mean_absolute_error(y, y_pred_oof)
    r2  = r2_score(y, y_pred_oof)
    rm  = rmse(y, y_pred_oof)
    mp  = mape_safe(y, y_pred_oof)

    # OOF per-bucket MAE (averaged across folds)
    per_bucket_df = pd.concat(per_bucket_records, ignore_index=True)
    bucket_mae = per_bucket_df.groupby("bucket", as_index=False)["mae"].mean()
    out_dir.mkdir(parents=True, exist_ok=True)
    bucket_mae.to_csv(out_dir / "bucket_mae.csv", index=False)

    metrics = {
        "n_samples": int(len(df)),
        "cv": k,
        "oof_mae": float(mae),
        "oof_rmse": float(rm),
        "oof_r2": float(r2),
        "oof_mape_pct": float(mp),
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))

    pred_df = pd.DataFrame({
        "quote_id": df.get("id", pd.Series(range(len(df)))),
        "residual_true": y,
        "residual_oof_pred": y_pred_oof,
        "bucket": buckets_all,
    })
    pred_df.to_csv(out_dir / "predictions.csv", index=False)

def fit_final_model_and_export(df: pd.DataFrame, cat_cols, num_cols, out_dir: Path):
    """Fit final model on ALL data. Also writes similarity_index.json & bucket_stats.json."""
    out_dir.mkdir(parents=True, exist_ok=True)

    shrink_payload = build_bucket_stats(df.copy())
    (out_dir / "bucket_stats.json").write_text(json.dumps(shrink_payload))

    build_similarity_index(
        df[["service_type","timeframe","channel","postcode_area","qty_sum","line_count","residual"]],
        out_dir / "similarity_index.json"
    )

    X = df[cat_cols + num_cols].copy()
    X["bucket_shrink_mean"] = map_shrink_mean(compute_bucket_key(df), shrink_payload)
    y = df["residual"].astype(float).values

    pre = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
            ("num", "passthrough", num_cols + ["bucket_shrink_mean"]),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    gbdt = GradientBoostingRegressor(
        loss="absolute_error",
        n_estimators=600,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.9,
        random_state=42,
    )
    pipe = Pipeline([("pre", pre), ("model", gbdt)])
    pipe.fit(X, y)

    joblib.dump(pipe, out_dir / "pricing_residual.pkl")

    if ONNX_OK:
        try:
            initial_types = [
                ("service_type", StringTensorType([None, 1])),
                ("timeframe", StringTensorType([None, 1])),
                ("channel", StringTensorType([None, 1])),
                ("postcode_area", StringTensorType([None, 1])),
                ("customer_interaction_channel", StringTensorType([None, 1])),
                ("qty_sum", FloatTensorType([None, 1])),
                ("line_count", FloatTensorType([None, 1])),
                ("customer_satisfaction", FloatTensorType([None, 1])),
                ("customer_total_purchases", FloatTensorType([None, 1])),
                ("bucket_shrink_mean", FloatTensorType([None, 1])),
            ]
            onnx_model = convert_sklearn(pipe, initial_types=initial_types, target_opset=15)
            (out_dir / "pricing_residual.onnx").write_bytes(onnx_model.SerializeToString())
        except Exception as e:
            warnings.warn(f"ONNX export failed (continuing with PKL only): {e}")

def main():
    quotes_csv = DEFAULT_QUOTES_CSV
    customers_csv = DEFAULT_CUSTOMERS_CSV
    out_dir = DEFAULT_OUT_DIR

    print(f"Using:\n  quotes_csv     = {quotes_csv}\n  customers_csv  = {customers_csv}\n  out_dir        = {out_dir}")

    df = build_df(quotes_csv, customers_csv)

    cat_cols = ["service_type","timeframe","channel","postcode_area","customer_interaction_channel"]
    num_cols = ["qty_sum","line_count","customer_satisfaction","customer_total_purchases"]

    evaluate_cv_oof_with_bucket_feature(df, cat_cols, num_cols, out_dir)
    fit_final_model_and_export(df, cat_cols, num_cols, out_dir)
    print("✅ Training complete.")

if __name__ == "__main__":
    main()
