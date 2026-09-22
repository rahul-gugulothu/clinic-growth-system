import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { httpRequest } from '../src/utils/httpClient.js';

vi.mock('../src/utils/httpClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/httpClient.js')>();
  return { ...actual, httpRequest: vi.fn() };
});

const mockedHttpRequest = vi.mocked(httpRequest);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const DEV_ORG_ADMIN_ID = '00000000-0000-0000-0000-000000000004';
const DEV_CLINIC_OWNER_ID = '00000000-0000-0000-0000-000000000003';
const DEV_CLINIC_DOCTOR_ID = '00000000-0000-0000-0000-000000000005';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';

const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbb-cccc-dddd-eeeeeeeeee03';

const PROVIDER = 'sendgrid';
const SECRET = 'SENDGRID_API_KEY_SECRET_999';
const FROM_EMAIL = 'sendgrid@example.com';

const founderAuth: AuthContext = {
  userId: DEV_FOUNDER_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};
const orgAdminAuth: AuthContext = {
  userId: DEV_ORG_ADMIN_ID,
  organizationId: DEV_ORG_ID,
  role: 'org_admin',
  clinicId: null,
};
const clinicOwnerAuth: AuthContext = {
  userId: DEV_CLINIC_OWNER_ID,
  organizationId: DEV_ORG_ID,
  role: 'clinic_owner',
  clinicId: DEV_CLINIC_ID,
};
const clinicDoctorAuth: AuthContext = {
  userId: DEV_CLINIC_DOCTOR_ID,
  organizationId: DEV_ORG_ID,
  role: 'clinic_doctor',
  clinicId: DEV_CLINIC_ID,
};
const userBAuth: AuthContext = {
  userId: USER_B_ID,
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

type ErrorBody = { status: number; body: { error: { status: number; message: string } } };
const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});
const expect401 = (res: ErrorBody) => {
  expect(res.status).toBe(401);
  expect(res.body.error.status).toBe(401);
};
const expect403 = (res: ErrorBody) => {
  expect(res.status).toBe(403);
  expect(res.body.error.status).toBe(403);
};
const expect400 = (res: ErrorBody) => {
  expect(res.status).toBe(400);
  expect(res.body.error.status).toBe(400);
};

describe('V3.1.2-C1-C Integration Config API', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  const founderToken = signAccessToken(founderAuth);
  const orgAdminToken = signAccessToken(orgAdminAuth);
  const clinicOwnerToken = signAccessToken(clinicOwnerAuth);
  const clinicDoctorToken = signAccessToken(clinicDoctorAuth);
  const userBToken = signAccessToken(userBAuth);

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(async () => {
    mockedHttpRequest.mockReset();
    await memPool.query(`DELETE FROM integration_configs`);
  });

  const putConfig = (token: string | null, body: Record<string, unknown>) => {
    const req = request(app).put('/api/v1/integrations/config');
    if (token) {
      req.set(authHeader(token));
    }
    return req.send(body);
  };

  const deleteConfig = (token: string | null, body: Record<string, unknown>) => {
    const req = request(app).delete('/api/v1/integrations/config');
    if (token) {
      req.set(authHeader(token));
    }
    return req.send(body);
  };

  const getStatus = (token: string | null, provider?: string, configKey?: string) => {
    const req = request(app).get('/api/v1/integrations/config/status');
    if (token) {
      req.set(authHeader(token));
    }
    const params: Record<string, string> = {};
    if (provider) {
      params.provider = provider;
    }
    if (configKey) {
      params.config_key = configKey;
    }
    return req.query(params as Record<string, string>);
  };

  const getHealth = (token: string | null) => {
    const req = request(app).get('/api/v1/integrations/health');
    if (token) {
      req.set(authHeader(token));
    }
    return req;
  };

  const queryDb = async (
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
    const res = params ? await memPool.query(sql, params) : await memPool.query(sql);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
  };

  // ==================================================================
  // C1-C.1–3: authentication
  // ==================================================================
  describe('C1-C.1 unauthenticated GET status denied', () => {
    it('GET status without token → 401', async () => {
      const res = await getStatus(null, PROVIDER);
      expect401(res);
    });
  });

  describe('C1-C.2 unauthenticated PUT denied', () => {
    it('PUT config without token → 401', async () => {
      const res = await putConfig(null, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      expect401(res);
    });
  });

  describe('C1-C.3 unauthenticated DELETE denied', () => {
    it('DELETE config without token → 401', async () => {
      const res = await deleteConfig(null, {
        provider: PROVIDER,
        config_key: 'api_key',
      });
      expect401(res);
    });
  });

  // ==================================================================
  // C1-C.4–7: authorization / roles
  // ==================================================================
  describe('C1-C.4 founder can create config', () => {
    it('PUT config as founder → 200, configured true', async () => {
      const res = await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        provider: PROVIDER,
        config_key: 'api_key',
        configured: true,
      });
    });
  });

  describe('C1-C.5 org_admin can create config', () => {
    it('PUT config as org_admin → 200', async () => {
      const res = await putConfig(orgAdminToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
    });
  });

  describe('C1-C.6 non-admin organization role denied mutation', () => {
    it('PUT config as clinic_owner → 403', async () => {
      const res = await putConfig(clinicOwnerToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      expect403(res);
    });
  });

  describe('C1-C.7 clinic role denied mutation', () => {
    it('PUT config as clinic_doctor → 403', async () => {
      const res = await putConfig(clinicDoctorToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      expect403(res);
    });
  });

  // ==================================================================
  // C1-C.8–12: storage + status
  // ==================================================================
  describe('C1-C.8 stored value is encrypted', () => {
    it('DB config_value_encrypted is not plaintext', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const rows = await queryDb(
        `SELECT config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, PROVIDER, 'api_key']
      );

      expect(rows.rowCount).toBe(1);
      const stored = rows.rows[0].config_value_encrypted as string;
      expect(stored).not.toBe(SECRET);
      expect(stored).not.toContain(SECRET);
      expect(stored).toMatch(/^v1:/);
    });
  });

  describe('C1-C.9 PUT response never contains plaintext secret', () => {
    it('response body has no plaintext', async () => {
      const res = await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(SECRET);
    });
  });

  describe('C1-C.10 PUT response never contains encrypted secret', () => {
    it('response body has no ciphertext', async () => {
      const res = await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('v1:');
      expect(serialized).not.toContain('config_value_encrypted');
    });
  });

  describe('C1-C.11 status configured=true after set', () => {
    it('GET status → configured true', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const res = await getStatus(founderToken, PROVIDER);
      expect(res.status).toBe(200);
      expect(res.body.provider).toBe(PROVIDER);
      expect(res.body.configured).toBe(true);
    });
  });

  describe('C1-C.12 status configured=false when missing', () => {
    it('GET status → configured false', async () => {
      const res = await getStatus(founderToken, PROVIDER);
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });

  // ==================================================================
  // C1-C.13–14: delete + status after delete
  // ==================================================================
  describe('C1-C.13 DELETE performs soft delete', () => {
    it('DELETE → soft delete; row retains deleted_at', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const del = await deleteConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
      });
      expect(del.status).toBe(200);
      expect(del.body).toEqual({
        provider: PROVIDER,
        config_key: 'api_key',
        deleted: true,
      });

      const rows = await queryDb(
        `SELECT deleted_at, config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, PROVIDER, 'api_key']
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].deleted_at).not.toBeNull();
      expect(rows.rows[0].config_value_encrypted).not.toBeNull();
    });
  });

  describe('C1-C.14 deleted config reports configured=false', () => {
    it('after DELETE, GET status → configured false', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      await deleteConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
      });

      const res = await getStatus(founderToken, PROVIDER);
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });

  // ==================================================================
  // C1-C.15: organization isolation
  // ==================================================================
  describe('C1-C.15 organization isolation', () => {
    it('Org A config is not visible to Org B', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const own = await getStatus(founderToken, PROVIDER);
      expect(own.body.configured).toBe(true);

      const other = await getStatus(userBToken, PROVIDER);
      expect(other.status).toBe(200);
      expect(other.body.configured).toBe(false);

      const otherDel = await deleteConfig(userBToken, {
        provider: PROVIDER,
        config_key: 'api_key',
      });
      expect(otherDel.status).toBe(200);
      expect(otherDel.body.deleted).toBe(true);

      const stillThere = await getStatus(founderToken, PROVIDER);
      expect(stillThere.body.configured).toBe(true);
    });
  });

  // ==================================================================
  // C1-C.16–18: health endpoint
  // ==================================================================
  describe('C1-C.16 health reports missing required configuration', () => {
    it('no config set → all required keys missing', async () => {
      const res = await getHealth(founderToken);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.all_healthy).toBe(true);
      expect(res.body.integrations.sendgrid).toEqual({
        configured: false,
        missing_keys: ['api_key', 'from_email'],
        healthy: false,
        checked_at: null,
      });
    });
  });

  describe('C1-C.17 health reports configured state', () => {
    it('only api_key set → configured true, from_email missing', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });

      const res = await getHealth(founderToken);
      expect(res.status).toBe(200);
      expect(res.body.integrations.sendgrid).toEqual({
        configured: true,
        missing_keys: ['from_email'],
        healthy: false,
        checked_at: null,
      });
    });
  });

  describe('C1-C.18 health never exposes secrets', () => {
    it('health response contains no plaintext or ciphertext', async () => {
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: SECRET,
      });
      await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'from_email',
        config_value: FROM_EMAIL,
      });

      mockedHttpRequest.mockResolvedValue({ status: 200, ok: true, headers: { get: () => null } });

      const res = await getHealth(founderToken);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain(FROM_EMAIL);
      expect(serialized).not.toContain('v1:');
      expect(serialized).not.toContain('config_value_encrypted');

      expect(res.body.integrations.sendgrid).toMatchObject({
        configured: true,
        missing_keys: [],
        healthy: true,
      });
      expect(res.body.integrations.sendgrid.checked_at).not.toBeNull();
    });
  });

  // ==================================================================
  // C1-C.19 healthCheck: provider health probing
  // ==================================================================
  describe('C1-C.19 health calls provider healthCheck when configured', () => {
    const okHttp = () => ({ status: 200, ok: true, headers: { get: () => null } });

    it('returns healthy=true when provider healthCheck succeeds', async () => {
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'api_key', config_value: SECRET });
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'from_email', config_value: FROM_EMAIL });
      mockedHttpRequest.mockResolvedValue(okHttp());

      const res = await getHealth(founderToken);

      expect(res.status).toBe(200);
      expect(res.body.integrations.sendgrid.healthy).toBe(true);
      expect(res.body.integrations.sendgrid.checked_at).not.toBeNull();
      expect(res.body.all_healthy).toBe(true);
    });

    it('returns healthy=false when provider healthCheck fails', async () => {
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'api_key', config_value: SECRET });
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'from_email', config_value: FROM_EMAIL });
      mockedHttpRequest.mockResolvedValue({ status: 503, ok: false, headers: { get: () => null } });

      const res = await getHealth(founderToken);

      expect(res.body.integrations.sendgrid.healthy).toBe(false);
      expect(res.body.all_healthy).toBe(false);
    });

    it('returns healthy=false on network error', async () => {
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'api_key', config_value: SECRET });
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'from_email', config_value: FROM_EMAIL });
      mockedHttpRequest.mockRejectedValue(new Error('network error'));

      const res = await getHealth(founderToken);

      expect(res.body.integrations.sendgrid.healthy).toBe(false);
      expect(res.body.all_healthy).toBe(false);
    });

    it('does not call healthCheck when keys are missing', async () => {
      mockedHttpRequest.mockResolvedValue(okHttp());

      const res = await getHealth(founderToken);

      expect(res.body.integrations.sendgrid.healthy).toBe(false);
      expect(res.body.integrations.sendgrid.checked_at).toBeNull();
      expect(mockedHttpRequest).not.toHaveBeenCalled();
    });

    it('all_healthy is true when no providers are configured', async () => {
      const res = await getHealth(founderToken);

      expect(res.body.all_healthy).toBe(true);
    });

    it('all_healthy is false when any configured provider is unhealthy', async () => {
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'api_key', config_value: SECRET });
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'from_email', config_value: FROM_EMAIL });
      mockedHttpRequest.mockResolvedValue({ status: 500, ok: false, headers: { get: () => null } });

      const res = await getHealth(founderToken);

      expect(res.body.all_healthy).toBe(false);
    });

    it('health response contains no secrets on provider failure', async () => {
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'api_key', config_value: SECRET });
      await putConfig(founderToken, { provider: PROVIDER, config_key: 'from_email', config_value: FROM_EMAIL });
      mockedHttpRequest.mockRejectedValue(new Error('network error'));

      const res = await getHealth(founderToken);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain(FROM_EMAIL);
    });
  });

  // ==================================================================
  // C1-C.19: malformed request bodies
  // ==================================================================
  describe('C1-C.19 malformed request bodies return validation errors', () => {
    it('PUT missing config_value → 400', async () => {
      const res = await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
      });
      expect400(res);
    });

    it('PUT empty body → 400', async () => {
      const res = await putConfig(founderToken, {});
      expect400(res);
    });

    it('PUT empty config_value → 400', async () => {
      const res = await putConfig(founderToken, {
        provider: PROVIDER,
        config_key: 'api_key',
        config_value: '',
      });
      expect400(res);
    });

    it('DELETE missing config_key → 400', async () => {
      const res = await deleteConfig(founderToken, { provider: PROVIDER });
      expect400(res);
    });

    it('GET status missing provider → 400', async () => {
      const res = await getStatus(founderToken);
      expect400(res);
    });
  });
});
