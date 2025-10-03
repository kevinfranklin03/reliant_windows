import { Request, Response } from 'express';
import * as svc from './users.service';

/**
 * Users Controller
 * ----------------
 * Keep this thin: parse inputs, call service, return JSON.
 * Validation beyond HTTP shape should live in users.service.
 */

/** GET /api/users – list all users (no filters yet) */
export async function listUsers(_req: Request, res: Response) {
  // Simple pass-through to the service layer.
  const rows = await svc.listUsers();
  res.json(rows);
}

/** POST /api/users – create a user */
export async function createUser(req: Request, res: Response) {
  try {
    // TODO: add schema validation (e.g., Zod) before hitting the DB.
    const row = await svc.createUser(req.body);
    res.status(201).json(row);
  } catch (e: any) {
    // For now, treat any service/DB error as 400 (could map specific codes later).
    res.status(400).json({ error: e.message });
  }
}

/** PATCH /api/users/:id – update a user */
export async function updateUser(req: Request, res: Response) {
  try {
    // NOTE: We rely on the service to handle partial updates.
    const row = await svc.updateUser(req.params.id, req.body);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

/** DELETE /api/users/:id – hard delete */
export async function deleteUser(req: Request, res: Response) {
  // Returns 204 on success, 404 when id doesn’t exist.
  const ok = await svc.deleteUser(req.params.id);
  return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
}
