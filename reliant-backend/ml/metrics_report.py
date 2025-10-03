# ml/metrics_report.py
# Generate diagrams + a tiny HTML dashboard from the training artifacts.

import json
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import joblib

# ---------- config ----------
OUT_DIR = Path("models")
PRED_CSV = OUT_DIR / "predictions.csv"
BUCKET_CSV = OUT_DIR / "bucket_mae.csv"
METRICS_JSON = OUT_DIR / "metrics.json"
MODEL_PKL = OUT_DIR / "pricing_residual.pkl"
REPORT_HTML = OUT_DIR / "report.html"

OUT_SCATTER = OUT_DIR / "residual_true_vs_pred.png"
OUT_HIST = OUT_DIR / "residual_error_hist.png"
OUT_BUCKET = OUT_DIR / "bucket_mae_top.png"
OUT_CALIB = OUT_DIR / "calibration_plot.png"
OUT_FEAT = OUT_DIR / "feature_importance.png"

# ---------- helpers ----------
def _fmt_gbp(v): return f"£{v:,.2f}"

def save_scatter(df: pd.DataFrame):
    y = df["residual_true"].astype(float).values
    yhat = df["residual_oof_pred"].astype(float).values
    mx = float(max(np.max(y), np.max(yhat)) * 1.05)

    plt.figure(figsize=(7, 6))
    plt.scatter(y, yhat, s=16, alpha=0.6)
    plt.plot([0, mx], [0, mx], linewidth=2)
    plt.xlabel("True residual (net − baseline subtotal)")
    plt.ylabel("OOF predicted residual")
    plt.title("True vs Predicted (Out-of-Fold)")
    plt.tight_layout()
    plt.savefig(OUT_SCATTER, dpi=140)
    plt.close()

def save_hist(df: pd.DataFrame):
    err = (df["residual_oof_pred"] - df["residual_true"]).astype(float).values
    plt.figure(figsize=(7, 4.5))
    plt.hist(err, bins=20)
    plt.xlabel("Error (pred − true)")
    plt.ylabel("Count")
    plt.title("Residual Error Histogram (OOF)")
    plt.tight_layout()
    plt.savefig(OUT_HIST, dpi=140)
    plt.close()

def save_bucket_mae(bucket_df: pd.DataFrame, top_n: int = 20):
    # show worst buckets first
    x = bucket_df.copy()
    x["bucket"] = x["bucket"].astype(str)
    x = x.sort_values("mae", ascending=False).head(top_n)
    plt.figure(figsize=(9, max(4, 0.35 * len(x))))
    plt.barh(x["bucket"], x["mae"])
    plt.gca().invert_yaxis()
    plt.xlabel("MAE (£)")
    plt.title(f"Per-bucket MAE (Top {len(x)})")
    plt.tight_layout()
    plt.savefig(OUT_BUCKET, dpi=150)
    plt.close()

def save_calibration(df: pd.DataFrame, bins: int = 10):
    y = df["residual_true"].astype(float).values
    yhat = df["residual_oof_pred"].astype(float).values
    # deciles by predicted residual
    q = np.quantile(yhat, np.linspace(0, 1, bins + 1))
    idx = np.digitize(yhat, q[1:-1], right=True)
    means_pred = []
    means_true = []
    for i in range(bins):
        msk = idx == i
        if not msk.any():
            means_pred.append(np.nan)
            means_true.append(np.nan)
        else:
            means_pred.append(np.mean(yhat[msk]))
            means_true.append(np.mean(y[msk]))
    plt.figure(figsize=(7, 4.5))
    plt.plot(means_pred, means_true, marker="o")
    lo = 0
    hi = float(max(np.nanmax(means_pred), np.nanmax(means_true)) * 1.05)
    plt.plot([lo, hi], [lo, hi], linestyle="--")
    plt.xlabel("Mean predicted residual (bin)")
    plt.ylabel("Mean true residual (bin)")
    plt.title("Calibration (by prediction decile)")
    plt.tight_layout()
    plt.savefig(OUT_CALIB, dpi=140)
    plt.close()

def save_feature_importance():
    # Load sklearn pipeline to get feature weights (RidgeCV)
    if not MODEL_PKL.exists():
        return False
    pipe = joblib.load(MODEL_PKL)
    # Try to get names from preprocessing
    try:
        names = pipe.named_steps["pre"].get_feature_names_out()
        coef = pipe.named_steps["model"].coef_
        w = pd.DataFrame({"feature": names, "weight": coef})
        w["abs"] = w["weight"].abs()
        w = w.sort_values("abs", ascending=False).head(25)

        plt.figure(figsize=(9, max(4, 0.35 * len(w))))
        plt.barh(w["feature"], w["abs"])
        plt.gca().invert_yaxis()
        plt.xlabel("|Weight|")
        plt.title("Top 25 Features (by |coefficient|)")
        plt.tight_layout()
        plt.savefig(OUT_FEAT, dpi=150)
        plt.close()
        return True
    except Exception:
        return False

def build_html(metrics: dict):
    def img(path: Path):
        return f'<img src="{path.name}" style="max-width:100%;border:1px solid #e5e5e5;border-radius:8px;margin:10px 0;" />'

    body = f"""
    <h1>Pricing Model Report</h1>
    <p><b>Samples:</b> {metrics.get('n_samples')}</p>
    <ul>
      <li><b>CV (k={metrics.get('cv')}):</b> MAE = {_fmt_gbp(metrics.get('cv_mae', 0))} (± {_fmt_gbp(metrics.get('cv_mae_std', 0))})</li>
      <li><b>OOF:</b> MAE = {_fmt_gbp(metrics.get('oof_mae', 0))}, RMSE = {_fmt_gbp(metrics.get('oof_rmse', 0))}, R² = {metrics.get('oof_r2', 0):.3f}, MAPE = {metrics.get('oof_mape_pct', 0):.1f}%</li>
      <li><b>Baselines:</b> global-mean MAE = {_fmt_gbp(metrics.get('baseline_mae_global_mean', 0))}, bucket-mean MAE = {_fmt_gbp(metrics.get('baseline_mae_bucket_mean', 0))}</li>
      <li><b>In-sample:</b> MAE = {_fmt_gbp(metrics.get('insample_mae', 0))}, RMSE = {_fmt_gbp(metrics.get('insample_rmse', 0))}, R² = {metrics.get('insample_r2', 0):.3f}, MAPE = {metrics.get('insample_mape_pct', 0):.1f}%</li>
    </ul>

    <h2>True vs Predicted (OOF)</h2>
    {img(OUT_SCATTER)}

    <h2>Error Distribution</h2>
    {img(OUT_HIST)}

    <h2>Per-Bucket MAE (worst buckets)</h2>
    {img(OUT_BUCKET)}

    <h2>Calibration</h2>
    {img(OUT_CALIB)}
    """

    if OUT_FEAT.exists():
        body += f"""
        <h2>Top Features (Ridge coefficients)</h2>
        {img(OUT_FEAT)}
        """

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pricing Model Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,'Noto Sans',sans-serif;max-width:980px;margin:20px auto;padding:0 16px;}} h1,h2{{margin:8px 0 4px}} ul{{line-height:1.6}}</style>
</head><body>
{body}
</body></html>"""
    REPORT_HTML.write_text(html, encoding="utf-8")

def main():
    # load data
    if not METRICS_JSON.exists():
        raise SystemExit("models/metrics.json not found — run the trainer first.")
    if not PRED_CSV.exists():
        raise SystemExit("models/predictions.csv not found — run the trainer first.")
    if not BUCKET_CSV.exists():
        raise SystemExit("models/bucket_mae.csv not found — run the trainer first.")

    metrics = json.loads(METRICS_JSON.read_text())
    pred_df = pd.read_csv(PRED_CSV)
    bucket_df = pd.read_csv(BUCKET_CSV)

    # plots
    save_scatter(pred_df)
    save_hist(pred_df)
    save_bucket_mae(bucket_df)
    save_calibration(pred_df)
    feat_ok = save_feature_importance()

    # html
    build_html(metrics)
    print(f"Report written to: {REPORT_HTML.resolve()}")
    if feat_ok:
        print("Included top-features diagram.")
    else:
        print("Skipped feature diagram (model PKL missing or incompatible).")

if __name__ == "__main__":
    main()
