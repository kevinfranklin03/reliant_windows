
import argparse
from pathlib import Path
import json
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import KFold, cross_val_score, cross_val_predict
from sklearn.metrics import mean_absolute_error, r2_score, f1_score, precision_score, recall_score

import joblib
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType, StringTensorType

# ---------------- helpers ----------------
def postcode_area(pc: str) -> str:
    if not isinstance(pc, str) or not pc.strip():
        return ""
    return pc.strip().split()[0].upper()

def mape(y_true, y_pred, eps=1e-6):
    y_true = np.asarray(y_true, float)
    y_pred = np.asarray(y_pred, float)
    denom = np.maximum(np.abs(y_true), eps)
    return float(np.mean(np.abs((y_true - y_pred) / denom))) * 100.0

def rmse(y_true, y_pred):
    y_true = np.asarray(y_true, float)
    y_pred = np.asarray(y_pred, float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

def huber_loss(y_true, y_pred, delta=50.0):
    e = np.asarray(y_true) - np.asarray(y_pred)
    a = np.abs(e)
    quad = 0.5 * (e ** 2)
    lin = delta * (a - 0.5 * delta)
    return float(np.mean(np.where(a <= delta, quad, lin)))

def pinball_loss(y_true, y_pred, tau=0.5):
    e = np.asarray(y_true) - np.asarray(y_pred)
    return float(np.mean(np.maximum(tau * e, (tau - 1) * e)))

def build_df(quotes_csv: str, customers_csv: str):
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

    # baseline subtotal & residual target
    df["baseline_subtotal"] = (
        df["base_cost"] + df["material_cost"] + df["labour_cost"] +
        df["overhead_cost"] + df["timeline_cost"] + df["transport_cost"] +
        df["service_fee"]
    )
    df["residual"] = (df["total_net"] - df["baseline_subtotal"]).clip(lower=0.0)

    # engineered proxies (until per-item agg is available)
    df["qty_sum"]    = (df["material_cost"] / 25.0).clip(lower=0.0)   # unitMaterial≈25
    df["line_count"] = np.maximum(1.0, df["labour_cost"] / 35.0)       # per-line labour≈35

    # features (for linear model only; we still export it)
    X = df[[
        "service_type","timeframe","channel","postcode_area","customer_interaction_channel",
        "qty_sum","line_count","customer_satisfaction","customer_total_purchases"
    ]].copy()
    for col in ["qty_sum","line_count","customer_satisfaction","customer_total_purchases"]:
        X[col] = pd.to_numeric(X[col], errors="coerce").fillna(0.0)

    y = df["residual"].astype(float)
    return X, y, df

def build_similarity_index(df: pd.DataFrame, out_path: Path, max_points_per_bucket: int = 200):
    df = df.copy()
    df["bucket"] = (
        df["service_type"].astype(str) + "|" +
        df["timeframe"].astype(str) + "|" +
        df["channel"].astype(str) + "|" +
        df["postcode_area"].astype(str)
    )

    buckets = {}
    for b, g in df.groupby("bucket", as_index=True):
        pts = g[["qty_sum","line_count","residual"]].dropna()
        if len(pts) > max_points_per_bucket:
            pts = pts.sample(max_points_per_bucket, random_state=42)
        buckets[b] = pts.to_numpy(dtype=float).tolist()

    payload = { "version": 1, "k": 5, "buckets": buckets }
    out_path.write_text(json.dumps(payload))
    print(f"Saved similarity index with {len(buckets)} buckets to {out_path}")

def build_bucket_stats(df: pd.DataFrame, out_path: Path):
    """Empirical-Bayes shrinkage of per-bucket means toward global mean."""
    df = df.copy()
    df["bucket"] = (
        df["service_type"].astype(str) + "|" +
        df["timeframe"].astype(str) + "|" +
        df["channel"].astype(str) + "|" +
        df["postcode_area"].astype(str)
    )

    g = df.groupby("bucket", as_index=False)["residual"].agg(["mean","var","count"]).reset_index()
    g = g.rename(columns={"mean":"mean_residual", "var":"var_residual", "count":"n"}).fillna(0.0)

    global_mean = float(df["residual"].mean())
    # between-bucket variance (var of bucket means)
    tau2 = float(np.var(g["mean_residual"].values, ddof=1)) if len(g) > 1 else 0.0
    # guard rails
    tau2 = max(tau2, 1e-6)

    # shrinkage factor alpha = n / (n + lambda), lambda = sigma2 / tau2
    # use per-bucket variance (sigma2). If zero/NaN, use global residual var.
    global_sigma2 = float(df["residual"].var(ddof=1)) if len(df) > 1 else 0.0
    global_sigma2 = max(global_sigma2, 1e-6)

    shrink_rows = []
    for _, row in g.iterrows():
        b = str(row["bucket"])
        n = float(row["n"])
        mean_b = float(row["mean_residual"])
        sigma2 = float(row["var_residual"]) if row["var_residual"] > 0 else global_sigma2
        lam = sigma2 / tau2
        alpha = n / (n + lam) if (n + lam) > 0 else 0.0
        shrink_mean = alpha * mean_b + (1 - alpha) * global_mean
        shrink_rows.append((b, n, mean_b, shrink_mean))

    payload = {
        "version": 1,
        "global_mean": global_mean,
        "buckets": { b: {"n": n, "mean": m, "shrink_mean": sm} for (b, n, m, sm) in shrink_rows }
    }
    out_path.write_text(json.dumps(payload))
    print(f"Saved bucket stats (with shrinkage) to {out_path}")

def evaluate_and_save_reports(pipe: Pipeline, X: pd.DataFrame, y: pd.Series,
                              df: pd.DataFrame, out_dir: Path,
                              f1_threshold: float = 250.0):
    out_dir.mkdir(parents=True, exist_ok=True)

    # CV MAE
    k = min(5, len(X))
    cv = KFold(n_splits=k, shuffle=True, random_state=42)
    cv_mae_scores = cross_val_score(pipe, X, y, cv=cv, scoring="neg_mean_absolute_error")
    cv_mae = float(np.mean(-cv_mae_scores))
    cv_mae_std = float(np.std(-cv_mae_scores))

    # OOF predictions
    y_pred_oof = cross_val_predict(pipe, X, y, cv=cv, n_jobs=None, verbose=0)
    y_true = y.values
    oof_mae  = mean_absolute_error(y_true, y_pred_oof)
    oof_rmse = rmse(y_true, y_pred_oof)
    oof_r2   = r2_score(y_true, y_pred_oof)
    oof_mape = mape(y_true, y_pred_oof)
    oof_huber = huber_loss(y_true, y_pred_oof, delta=50.0)
    oof_pinball = pinball_loss(y_true, y_pred_oof, tau=0.5)

    # Optional F1-style view
    y_true_cls = (y_true >= f1_threshold).astype(int)
    y_pred_cls = (np.asarray(y_pred_oof) >= f1_threshold).astype(int)
    oof_f1 = float(f1_score(y_true_cls, y_pred_cls, zero_division=0))
    oof_prec = float(precision_score(y_true_cls, y_pred_cls, zero_division=0))
    oof_rec  = float(recall_score(y_true_cls, y_pred_cls, zero_division=0))

    # Baselines
    global_mean = float(np.mean(y_true))
    base_pred_global = np.full_like(y_true, global_mean, dtype=float)
    base_mae_global  = mean_absolute_error(y_true, base_pred_global)

    # Bucket-mean baseline (warning-free)
    bucket = (
        X["service_type"].astype(str) + "|" +
        X["timeframe"].astype(str) + "|" +
        X["channel"].astype(str) + "|" +
        X["postcode_area"].astype(str)
    )
    df_eval = pd.DataFrame({
        "bucket": bucket.values,
        "y": y_true,
        "y_pred_oof": y_pred_oof,
    })
    tmp = df_eval[["bucket","y"]].copy()
    bucket_mean = tmp.groupby("bucket")["y"].transform("mean")
    base_mae_bucket_mean = mean_absolute_error(df_eval["y"], bucket_mean)

    # Per-bucket MAE of our model (warning-free)
    tmp2 = df_eval[["bucket","y","y_pred_oof"]].copy()
    bucket_mae = (
        tmp2.groupby("bucket", as_index=False)
            .apply(lambda g: pd.Series({"mae": mean_absolute_error(g["y"], g["y_pred_oof"])}))
            .reset_index(drop=True)
    )
    bucket_mae.to_csv(out_dir / "bucket_mae.csv", index=False)

    # Fit once on full data (for export)
    pipe.fit(X, y)
    y_fit = pipe.predict(X)
    ins_mae  = mean_absolute_error(y_true, y_fit)
    ins_rmse = rmse(y_true, y_fit)
    ins_r2   = r2_score(y_true, y_fit)
    ins_mape = mape(y_true, y_fit)

    # Save predictions for inspection
    pred_df = pd.DataFrame({
        "quote_id": df.get("id", pd.Series(range(len(df)))),
        "residual_true": y_true,
        "residual_oof_pred": y_pred_oof,
        "residual_fit_pred": y_fit,
        "bucket": bucket.values,
    })
    pred_df.to_csv(out_dir / "predictions.csv", index=False)

    # Save metrics JSON
    metrics = {
      "n_samples": int(len(X)),
      "cv": k,
      "cv_mae": cv_mae,
      "cv_mae_std": cv_mae_std,

      "oof_mae": oof_mae,
      "oof_rmse": oof_rmse,
      "oof_r2": float(oof_r2),
      "oof_mape_pct": oof_mape,
      "oof_huber_delta50": oof_huber,
      "oof_pinball_tau0_5": oof_pinball,

      "oof_f1_T": f1_threshold,
      "oof_f1": oof_f1,
      "oof_precision": oof_prec,
      "oof_recall": oof_rec,

      "baseline_mae_global_mean": base_mae_global,
      "baseline_mae_bucket_mean": base_mae_bucket_mean,

      "insample_mae": ins_mae,
      "insample_rmse": ins_rmse,
      "insample_r2": float(ins_r2),
      "insample_mape_pct": ins_mape,
      "insample_huber_delta50": huber_loss(y_true, y_fit, delta=50.0),
      "insample_pinball_tau0_5": pinball_loss(y_true, y_fit, tau=0.5),
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))

    return pipe  # fitted

# --------------- main ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quotes_csv", required=True)
    ap.add_argument("--customers_csv", required=True)
    ap.add_argument("--out_dir", default="models")
    args = ap.parse_args()

    X, y, df = build_df(args.quotes_csv, args.customers_csv)

    cat_cols = ["service_type","timeframe","channel","postcode_area","customer_interaction_channel"]
    num_cols = ["qty_sum","line_count","customer_satisfaction","customer_total_purchases"]

    pre = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
            ("num", "passthrough", num_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    # RidgeCV kept for completeness (but we’ll down-weight it at runtime)
    alphas = np.logspace(-3, 3, 13)
    model = RidgeCV(alphas=alphas, cv=KFold(n_splits=min(5, len(X)), shuffle=True, random_state=42))
    pipe = Pipeline([("pre", pre), ("model", model)])

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Evaluate (CV + OOF + baselines) and fit on full data for export
    pipe = evaluate_and_save_reports(pipe, X, y, df, out_dir)

    # Save sklearn (debug)
    joblib.dump(pipe, out_dir / "pricing_residual.pkl")

    # Export ONNX (optional signal)
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
    ]
    onnx_model = convert_sklearn(pipe, initial_types=initial_types, target_opset=15)
    (out_dir / "pricing_residual.onnx").write_bytes(onnx_model.SerializeToString())
    print(f"Saved ONNX to {(out_dir / 'pricing_residual.onnx').resolve()}")

    # Build & save kNN similarity index
    build_similarity_index(
        df[["service_type","timeframe","channel","postcode_area","qty_sum","line_count","residual"]],
        out_dir / "similarity_index.json"
    )

    # Build & save bucket stats (Empirical-Bayes shrinkage means)
    build_bucket_stats(
        df[["service_type","timeframe","channel","postcode_area","residual"]],
        out_dir / "bucket_stats.json"
    )

if __name__ == "__main__":
    main()
