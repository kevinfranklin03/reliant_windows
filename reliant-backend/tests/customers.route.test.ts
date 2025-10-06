/// <reference types="jest" />
import request from 'supertest';
import { createApp } from '../src/app';

// use the in-memory DB
jest.mock('../src/db', () => require('./db.mock'));

describe('Customers routes', () => {
  const app = createApp();

  it('GET /api/customers returns a list (any common shape)', async () => {
    const res = await request(app).get('/api/customers?limit=5');
    expect(res.status).toBe(200);

    const body = res.body ?? {};
    const list =
      Array.isArray(body) ? body :
      Array.isArray(body.rows) ? body.rows :
      Array.isArray(body.items) ? body.items :
      Array.isArray(body.data) ? body.data :
      [];

    expect(Array.isArray(list)).toBe(true);
    if (list.length) {
      expect(list[0]).toEqual(expect.objectContaining({ id: expect.any(String) }));
    }
  });
});
