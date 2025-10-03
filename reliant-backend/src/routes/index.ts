import { Router } from "express";
import customersRouter from "../modules/customers/routes";
import productsRouter from "../modules/catalog/routes";
import servicesRouter from "../services/routes";
import quotesRouter from "../modules/quotes/routes";
import * as model from "../services/model.runtime"; // if you need model endpoints
import asyncHandler from "../utils/asyncHandler";

const api = Router();

// Simple API health
api.get("/health", (_req, res) => res.json({ ok: true, version: "v1" }));

// Domain routers
api.use("/customers", customersRouter);
api.use("/products", productsRouter);
api.use("/services", servicesRouter);
api.use("/quotes", quotesRouter);

// (Optional) model endpoints kept under /api/model/*
api.get("/model/health", asyncHandler(async (_req, res) => {
  await model.ensureModelLoaded();
  res.json(model.modelHealth());
}));

api.post("/model/warm", asyncHandler(async (_req, res) => {
  await model.predictResidual({
    service_type: "supply_only",
    timeframe: "asap",
    channel: "website",
    postcode_area: "B",
    customer_interaction_channel: "",
    qty_sum: 0, line_count: 0, customer_satisfaction: 0, customer_total_purchases: 0,
  });
  res.json(model.modelHealth());
}));

api.post("/model/reset", (_req, res) => {
  model.resetModelCaches();
  res.json(model.modelHealth());
});

export default api;
