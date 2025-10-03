// src/lib/api/users.ts
import { http } from "./http";

export async function listUsers() {
  return await http<any>({
    method: "GET",
    path: "/api/users",
  });
}

export async function patchUser(id: string, body: { role?: string }) {
  return await http<any>({
    method: "PATCH",
    path: `/api/users/${id}`,
    body,
  });
}
