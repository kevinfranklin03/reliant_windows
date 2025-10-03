import express from "express";
import helmet from "helmet";
import cors, { CorsOptions } from "cors";
import compression from "compression";
import morgan from "morgan";
import "dotenv/config"; 

import apiRouter from "./routes";
import { notFound, errorHandler } from "./middlewares/error";

export function createApp() {
  const ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

  const app = express();

  // Security & perf
  app.use(helmet({ crossOriginResourcePolicy: false }));
  const corsOptions: CorsOptions = {
    origin: ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-role"],
    credentials: false,
    optionsSuccessStatus: 204,
  };
  app.use(cors(corsOptions));
  app.use(compression());

  // Parsing & logging
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  // Health (public)
  app.get("/health", (_req, res) =>
    res.json({ ok: true, env: process.env.NODE_ENV || "development" })
  );

  // API v1
  app.use("/api", apiRouter);

  // 404 + errors
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
