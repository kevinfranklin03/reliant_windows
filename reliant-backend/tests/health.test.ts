// ✅ keep this
jest.mock('../src/db', () => require('./db.mock'));

// ❌ remove this line (it breaks because ../src/infra/db doesn't exist)
// jest.mock('../src/infra/db', () => require('./db.mock'));

import request from 'supertest';
import { createApp } from '../src/app';

describe('Health', () => {
  const app = createApp();

  it('GET /health -> { ok: true }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });
});
