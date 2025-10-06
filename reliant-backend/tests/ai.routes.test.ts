/// <reference types="jest" />
import request from 'supertest';
import { createApp } from '../src/app';

jest.mock('../src/db', () => require('./db.mock'));

describe('AI pricing route', () => {
  const app = createApp();

  it('POST /api/ai-suggest-price validates required fields', async () => {
    const r = await request(app).post('/api/ai-suggest-price').send({});
    // Your route should return 400/422 for missing required fields
    expect([400, 422]).toContain(r.status);
  });

  it('POST /api/ai-suggest-price returns a suggestion for minimal valid payload', async () => {
    const payload = {
      service_type: 'supply_and_install',
      timeframe: '3_6_months',
      channel: 'website',
      items: [{ description: 'uPVC Window - Casement', quantity: 2, uom: 'unit' }]
    };

    const r = await request(app).post('/api/ai-suggest-price').send(payload);
    expect([200, 201]).toContain(r.status);

    // Be tolerant on shape; just assert an object with (optional) numeric fields
    expect(typeof r.body).toBe('object');
    if ('suggested_total' in r.body) {
      expect(typeof r.body.suggested_total).toBe('number');
    }
  });
});
