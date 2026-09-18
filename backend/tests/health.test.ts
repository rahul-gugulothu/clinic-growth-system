import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import healthRouter from '../src/routes/health.js';

vi.mock('../src/db/index.js', () => ({
  checkDatabaseHealth: vi.fn(),
}));

import { checkDatabaseHealth } from '../src/db/index.js';

describe('Health Endpoint', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', healthRouter);
    vi.clearAllMocks();
  });

  it('returns 200 when database is connected', async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue({ connected: true, latencyMs: 5 });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks.database.connected).toBe(true);
    expect(typeof res.body.checks.database.latencyMs).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 503 when database is disconnected', async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue({ connected: false, latencyMs: 5000 });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.connected).toBe(false);
  });

  it('response excludes sensitive connection details', async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue({ connected: true, latencyMs: 3 });

    const res = await request(app).get('/api/v1/health');

    expect(res.body).not.toHaveProperty('connectionString');
    expect(res.body).not.toHaveProperty('password');
  });
});
