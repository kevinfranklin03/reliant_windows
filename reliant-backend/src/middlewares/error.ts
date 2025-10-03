import type { Request, Response, NextFunction } from "express";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not Found" });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error("[unhandled]", err?.stack || err?.message || err);
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message || "Internal Server Error";
  res.status(status).json({ error: message });
}
