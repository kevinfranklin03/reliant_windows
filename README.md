
# Reliant Windows UK — Pricing & Quotations Platform

### End-to-end CRM/ERP Web Application

**Tech Stack:**  
Node.js (TypeScript) + Express API • React (Vite) Front-end • PostgreSQL • Light ML layer for pricing suggestions.

---

## Table of Contents

- [Architecture](#architecture)
- [Folders](#folders)
- [Quick Start](#quick-start)
- [Environment](#environment)
- [API (HTTP) Overview](#api-http-overview)
  - [Customers](#customers)
  - [Products](#products)
  - [Services](#services)
  - [Quotes](#quotes)
  - [AI Pricing](#ai-pricing)
- [Front-end](#front-end)
- [Pricing Model (ML)](#pricing-model-ml)
  - [What it Predicts](#what-it-predicts)
  - [Signals Used](#signals-used)
  - [Training Process](#training-process)
  - [Runtime Blender](#runtime-blender)
  - [Metrics & Diagnostics](#metrics--diagnostics)
  - [Reproduce Training & Report](#reproduce-training--report)
- [Security & Roles](#security--roles)
- [Roadmap](#roadmap)
- [Notes for Reviewers](#notes-for-reviewers)

---

## Architecture

```

frontend/ (React + Vite)
backend/  (Express + TypeScript)
postgres  (managed or local)
models/   (trained artifacts: .onnx, bucket_stats.json, similarity_index.json, report.html)

````

- Front-end communicates with the Express API (`/api/...` endpoints).
- Express API reads/writes from PostgreSQL.
- ML components enhance pricing suggestions and export artifacts to `models/`.

---

## Folders

- `backend/`
  - `src/db.ts` — PG connection setup.
  - `src/routes.ts` — Main route registry.
  - `src/modules/*` — Business logic for customers, quotes, pricing, etc.
- `frontend/`
  - `src/lib/api/*` — API clients and fetch wrappers.
  - `src/pages/*` — Main pages (Customers, Quotes, etc).
  - `src/components/*` — Reusable UI components.
- `models/` — Exported ML artifacts and reports.

---

## Quick Start

```bash
# 1. Start PostgreSQL and create a DB
#    e.g. postgres://user:pass@localhost:5432/reliant

# 2. Backend
cd backend
cp .env.example .env
# Set DATABASE_URL and optional PRICING_* vars
npm install
npm run dev   # or: npm run build && npm start

# 3. Frontend
cd ../frontend
npm install
npm run dev   # Vite dev server (proxies to backend)
````

> ⚠️ This project uses direct SQL with `pg`. Migrations are not included—use your preferred tool (e.g., raw SQL, Prisma, etc.).

---

## Environment

Create a `.env` file in the `backend/` directory:

```ini
# Required
DATABASE_URL=postgres://user:pass@host:5432/dbname
OPENAI_API_KEY = sk....
# Optional (for SSL-enabled DBs)
PGSSL=true

# Optional: ML model paths
PRICING_MODEL_DIR=./models
PRICING_MODEL_PATH=./models/pricing_residual.onnx
PRICING_SIMILAR_PATH=./models/similarity_index.json
PRICING_BUCKET_PATH=./models/bucket_stats.json

# Runtime blend weights: bucket, kNN, onnx
PRICING_BLEND=0.70,0.25,0.05
```

---

## API (HTTP) Overview

Base path: `/api`. All endpoints use JSON.

### Customers

| Method | Route            | Query / Body                          | Description           |
| ------ | ---------------- | ------------------------------------- | --------------------- |
| GET    | `/customers`     | `q`, `has`, `channel`, `limit`, ...   | Search with filters   |
| GET    | `/customers/:id` | —                                     | Fetch single customer |
| POST   | `/customers`     | `{ name, email?, phone?, postcode? }` | Create new customer   |
| PATCH  | `/customers/:id` | Partial fields                        | Update customer       |
| DELETE | `/customers/:id` | —                                     | Delete customer       |

### Products

| Method | Route       | Body                                             | Description        |
| ------ | ----------- | ------------------------------------------------ | ------------------ |
| GET    | `/products` | `category`, `material`, `search`, `limit`, ...   | List products      |
| POST   | `/products` | `{ name, category, type_name, base_price, ... }` | Create new product |

### Services

| Method | Route       | Body                                      | Description    |
| ------ | ----------- | ----------------------------------------- | -------------- |
| GET    | `/services` | `search`, `active`, `limit`, ...          | List services  |
| POST   | `/services` | `{ name, pricing_model, base_rate, ... }` | Create service |

### Quotes

| Method | Route                | Body / Query                                       | Description        |                     |
| ------ | -------------------- | -------------------------------------------------- | ------------------ | ------------------- |
| GET    | `/quotes`            | `status`, `customer_q`, `from`, `to`, `limit`, ... | List/search quotes |                     |
| GET    | `/quotes/:id`        | —                                                  | View single quote  |                     |
| POST   | `/quotes`            | Header + line items                                | Create draft quote |                     |
| PUT    | `/quotes/:id`        | Partial header update                              | Update quote       |                     |
| PATCH  | `/quotes/:id/status` | `{ status: "accepted", "declined" }`                | Update quote status |
    |
| DELETE | `/quotes/:id`        | —                                                  | Delete quote       |                     |

### AI Pricing

| Method | Route                | Body                      | Description                  |
| ------ | -------------------- | ------------------------- | ---------------------------- |
| POST   | `/quotes/ai-suggest` | Quote header + line items | Auto-fill AI-suggested costs |
| POST   | `/api/notes/summarize` | text, max_words: 60  | summarize notes |

---

## Front-end

Built with **React + Vite** using **utility-first CSS** (Tailwind-style).

* **Sidebar**: grouped into Quoting, Catalogue, Operations, Admin.
* **Locked features** are marked with 🔒 until enabled.

### Main Pages

* **Home** — Quick actions & activity.
* **Customers** — Filterable table & full CRUD.
* **Make a Quote** — Step-by-step builder with product/service lines.
* **Quotations** — Quote list & detailed view.

---

## Pricing Model (ML)

### What it Predicts

A **residual cost uplift (in £)** added to the rule-based subtotal. Adjusts quotes based on historical outcomes.

### Signals Used

* **Categorical**: `service_type`, `timeframe`, `channel`, `postcode_area`, etc.
* **Numeric**: `qty_sum`, `line_count`, `customer_satisfaction`, `customer_total_purchases`.

### Training Process

* **Target**: `total_net − baseline_subtotal` (clipped at ≥ 0).
* **Pipeline**:

  * One-hot encode categoricals
  * Train a linear regression (`RidgeCV`)
* **Artifacts**:

  * `pricing_residual.onnx` – ONNX model
  * `similarity_index.json` – kNN index per bucket
  * `bucket_stats.json` – Shrink-mean priors

### Runtime Blender

Combines 3 signals using weighted average:

1. **Bucket shrink-mean**
2. **kNN neighbors in same bucket**
3. **ONNX model prediction**

Blend ratio set via `PRICING_BLEND` (default: `0.70,0.25,0.05`).

### Metrics & Diagnostics

**OOF Cross-Validation (100 quotes):**

* MAE: **£187.88**
* RMSE: £258.90
* R²: −0.109
* Baseline (global mean MAE): £182.69
* Baseline (bucket mean, non-CV): £21.69 ← *leaky*

**Top Error Buckets (MAE):**

* `supply_and_install|asap|social|B19` — £874.22
* `supply_only|asap|website|B29` — £796.08
* `supply_only|3_6_months|email|B7` — £717.66
* ...

**Generated Plots:**

* `residual_true_vs_pred.png`
* `residual_error_hist.png`

> Generated via: `metrics_report.py`

### Reproduce Training & Report

```bash
# Prepare input data
python train_pricing_model.py \
  --quotes_csv data/quotes.csv \
  --customers_csv data/customers.csv \
  --out_dir models

# Generate diagnostics
python metrics_report.py
# ➜ models/report.html
```

---

## Security & Roles

* Supports custom headers:

## Future
  * `x-api-key` — (optional) API key middleware
  * `x-user-role` — `"admin"`, `"manager"`, or `"staff"` to restrict UI actions
* JWT/session-based auth recommended for production.

---


## Notes for Reviewers

* Codebase is split into **`frontend/`** and **`backend/`**.
* ML layer is **small, interpretable**, and complements rule-based estimates.
* UI is **modular**, clean, and console-style — grouped nav and progressive unlocking (🔒).

---

```


