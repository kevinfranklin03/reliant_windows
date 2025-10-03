import { Request, Response } from 'express';
import * as svc from './catalog.service';

/**
 * Catalog controller
 * ------------------
 * Thin Express layer that delegates to catalog.service.
 * Keep it boring: parse inputs, call service, send JSON.
 * Any heavy lifting should live in the service layer.
 */

/**
 * GET /api/catalog/products
 * List products with optional filters + pagination.
 */
export async function listProducts(req: Request, res: Response) {
  try {
    // NOTE: Query params are strings by default; cast where needed.
    // Keep casting logic here so the service can assume proper types.
    const rows = await svc.listProducts({
      category: req.query.category as string | undefined,
      typeName: req.query.type_name as string | undefined, // URL uses snake_case; service expects typeName
      material: req.query.material as string | undefined,
      uom: req.query.uom as string | undefined,
      active: req.query.active ? req.query.active === 'true' : undefined, // "true"/"false" → boolean
      q: req.query.q as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,   // safe number cast
      offset: req.query.offset ? Number(req.query.offset) : undefined // safe number cast
    });

    // OK: return the raw rows; pagination meta can be added later if needed.
    res.json(rows);
  } catch (e: any) {
    // TODO: Consider a shared error mapper (Zod/Valibot) for cleaner messages.
    res.status(400).json({ error: e.message });
  }
}

/**
 * POST /api/catalog/products
 * Create a new product.
 */
export async function createProduct(req: Request, res: Response) {
  try {
    // TODO: Validate req.body (schema) before passing to the service.
    const row = await svc.createProduct(req.body);
    res.status(201).json(row);
  } catch (e: any) {
    // Bad request is fine for now; we can differentiate 409/422 later.
    res.status(400).json({ error: e.message });
  }
}

/**
 * GET /api/catalog/services
 * Return all service packages (e.g., install, survey).
 */
export async function listServices(_req: Request, res: Response) {
  // Keeping this simple—no filters for now.
  const rows = await svc.listServices();
  res.json(rows);
}

/**
 * POST /api/catalog/services
 * Create a new service package.
 */
export async function createService(req: Request, res: Response) {
  try {
    // TODO: Validate payload (name, pricing model, rates).
    const row = await svc.createService(req.body);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

/**
 * GET /api/catalog/repairs
 * List repair SKUs (lighter surface: category/uom/q).
 */
export async function listRepairs(req: Request, res: Response) {
  // NOTE: No pagination here yet—intentional (repair set is small).
  const rows = await svc.listRepairs({
    category: req.query.category as string | undefined,
    uom: req.query.uom as string | undefined,
    q: req.query.q as string | undefined,
  });
  res.json(rows);
}

/**
 * POST /api/catalog/repairs
 * Create a repair item.
 */
export async function createRepair(req: Request, res: Response) {
  try {
    // TODO: Add basic schema checks (price >= 0, required fields).
    const row = await svc.createRepair(req.body);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

/**
 * GET /api/catalog/materials
 * List materials used in products/BOMs.
 */
export async function listMaterials(_req: Request, res: Response) {
  const rows = await svc.listMaterials();
  res.json(rows);
}

/**
 * POST /api/catalog/materials
 * Create a material (e.g., uPVC, aluminium profile, hardware).
 */
export async function createMaterial(req: Request, res: Response) {
  try {
    // TODO: Validate (name unique? uom sane?).
    const row = await svc.createMaterial(req.body);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}
