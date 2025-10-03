import type { Request, Response, NextFunction } from "express";

export default function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<any>
>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}
