import { type Request, type Response, type NextFunction } from "express";
import {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  archiveCustomer,
  unarchiveCustomer,
  deleteCustomer,
} from "./customers.service";

/** GET /api/customers */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await listCustomers(req.query as any);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
}

/** GET /api/customers/:id */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getCustomerById(req.params.id);
    if (!row) return res.status(404).json({ error: "Not Found" });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

/** POST /api/customers */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await createCustomer(req.body ?? {});
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/customers/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await updateCustomer(req.params.id, req.body ?? {});
    if (!row) return res.status(400).json({ error: "No fields to update" });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

/** POST /api/customers/:id/archive */
export async function archive(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await archiveCustomer(req.params.id);
    if (!row) return res.status(404).json({ error: "Not Found or already archived" });
    res.json({ ok: true, customer: row });
  } catch (err) {
    next(err);
  }
}

/** POST /api/customers/:id/unarchive */
export async function unarchive(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await unarchiveCustomer(req.params.id);
    if (!row) return res.status(404).json({ error: "Not Found or not archived" });
    res.json({ ok: true, customer: row });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/customers/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteCustomer(req.params.id);
    if (result.conflict) {
      return res.status(409).json({
        error: "Customer has related quotes",
        quotes_count: result.quotes_count,
        suggestion: "Archive the customer or reassign their quotes before deleting.",
      });
    }
    if (!result.deleted) return res.status(404).json({ error: "Not Found" });
    res.status(204).end();
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(409).json({
        error: "Customer has related quotes",
        suggestion: "Archive or reassign quotes first.",
      });
    }
    next(err);
  }
}
