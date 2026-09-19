import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { NotFoundError } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { encryptSecret, decryptSecret, deriveKeyFromHex, KEY_LENGTH, AUTH_TAG_LENGTH } from '../src/utils/crypto.js';
import {
  setIntegrationConfig,
  getIntegrationConfig,
  deleteIntegrationConfig,
  getIntegrationConfigStatus,
} from '../src/services/integrationConfigs.js';

const TEST_KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const TEST_KEY = deriveKeyFromHex(TEST_KEY_HEX);

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EMAIL_PROVIDER = 'email';
const API_KEY = 'api_key';
const FROM_EMAIL = 'from_email';
const TEST_SECRET = 'SG.test.apikey.secret123';
const TEST_EMAIL = 'clinic@example.com';

const setConfig = (orgId: string, key: string, value: string) =>
  setIntegrationConfig({
    organizationId: orgId,
    provider: EMAIL_PROVIDER,
    configKey: key,
    value,
  });

const getConfig = (orgId: string, key: string) =>
  getIntegrationConfig({
    organizationId: orgId,
    provider: EMAIL_PROVIDER,
    configKey: key,
  });

const deleteConfig = (orgId: string, key: string) =>
  deleteIntegrationConfig({
    organizationId: orgId,
    provider: EMAIL_PROVIDER,
    configKey: key,
  });

const configStatus = (orgId: string) =>
  getIntegrationConfigStatus({
    organizationId: orgId,
    provider: EMAIL_PROVIDER,
  });

describe('V3.1.2-C1 Integration Config', () => {
  let tdb: TestDatabase;
  let memPool: Pool;

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await memPool.query(
      `INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
       VALUES ($1, 'Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B_ID]
    );
  });

  afterAll(async () => {
    await memPool.end();
  });

  const query = (sql: string, params?: unknown[]) =>
    params ? memPool.query(sql, params) : memPool.query(sql);

  // ==================================================================
  // Crypto utility tests
  // ==================================================================

  describe('C1. crypto utility', () => {
    it('C1.1 encrypt/decrypt round trip', () => {
      const encrypted = encryptSecret(TEST_SECRET, TEST_KEY);
      const decrypted = decryptSecret(encrypted, TEST_KEY);
      expect(decrypted).toBe(TEST_SECRET);
    });

    it('C1.2 same plaintext produces different ciphertext (random IV)', () => {
      const a = encryptSecret(TEST_SECRET, TEST_KEY);
      const b = encryptSecret(TEST_SECRET, TEST_KEY);
      expect(a).not.toBe(b);

      const partsA = a.split(':');
      const partsB = b.split(':');
      expect(partsA[1]).not.toBe(partsB[1]);
      expect(partsA[3]).not.toBe(partsB[3]);

      expect(decryptSecret(a, TEST_KEY)).toBe(TEST_SECRET);
      expect(decryptSecret(b, TEST_KEY)).toBe(TEST_SECRET);
    });

    it('C1.3 tampered ciphertext fails decryption', () => {
      const encrypted = encryptSecret(TEST_SECRET, TEST_KEY);
      const parts = encrypted.split(':');

      const tamperedTag = `${parts[0]}:${parts[1]}:${'0'.repeat(AUTH_TAG_LENGTH * 2)}:${parts[3]}`;
      expect(() => decryptSecret(tamperedTag, TEST_KEY)).toThrow();

      const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${'0'.repeat(parts[3].length)}`;
      expect(() => decryptSecret(tamperedCiphertext, TEST_KEY)).toThrow();
    });

    it('C1.4 invalid key length fails safely', () => {
      expect(() => encryptSecret(TEST_SECRET, Buffer.alloc(KEY_LENGTH - 1))).toThrow();
      expect(() => decryptSecret('v1:ab:cd:ef', Buffer.alloc(KEY_LENGTH - 1))).toThrow();
    });
  });

  // ==================================================================
  // Service tests
  // ==================================================================

  describe('C1.5 setIntegrationConfig stores encrypted value', async () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.5 stores encrypted value, not plaintext', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);

      const rows = await query(
        `SELECT config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );

      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].config_value_encrypted).not.toBe(TEST_SECRET);
      expect(rows.rows[0].config_value_encrypted).toContain(`:`);
      expect(rows.rows[0].config_value_encrypted).toMatch(/^v1:/);
    });
  });

  describe('C1.6 getIntegrationConfig returns decrypted value', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.6 returns decrypted value to service caller', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);
      await setConfig(DEV_ORG_ID, FROM_EMAIL, TEST_EMAIL);

      const apiKey = await getConfig(DEV_ORG_ID, API_KEY);
      const fromEmail = await getConfig(DEV_ORG_ID, FROM_EMAIL);

      expect(apiKey).toBe(TEST_SECRET);
      expect(fromEmail).toBe(TEST_EMAIL);
    });
  });

  describe('C1.7 getIntegrationConfigStatus', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.7 returns configured=true without exposing secrets', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);

      const status = await configStatus(DEV_ORG_ID);

      expect(status.configured).toBe(true);
      expect(JSON.stringify(status)).not.toContain(TEST_SECRET);
      expect(JSON.stringify(status)).not.toContain('config_value');
    });

    it('C1.8 returns configured=false when no config exists', async () => {
      const status = await configStatus(DEV_ORG_ID);

      expect(status.configured).toBe(false);
    });
  });

  describe('C1.9 soft-delete ignored', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.9 getIntegrationConfigStatus ignores soft-deleted config', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);
      await deleteConfig(DEV_ORG_ID, API_KEY);

      const status = await configStatus(DEV_ORG_ID);
      expect(status.configured).toBe(false);
    });

    it('C1.9 getIntegrationConfig ignores soft-deleted config', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);
      await deleteConfig(DEV_ORG_ID, API_KEY);

      await expect(getConfig(DEV_ORG_ID, API_KEY)).rejects.toThrow(NotFoundError);
    });
  });

  describe('C1.10 deleteIntegrationConfig', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.10 soft-deletes (sets deleted_at, does not remove row)', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);

      await deleteConfig(DEV_ORG_ID, API_KEY);

      const rows = await query(
        `SELECT deleted_at, config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );

      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].deleted_at).not.toBeNull();
    });
  });

  describe('C1.11 re-set soft-deleted key restores', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.11 restores soft-deleted key (sets deleted_at = NULL)', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, 'original-value');
      await deleteConfig(DEV_ORG_ID, API_KEY);

      await setConfig(DEV_ORG_ID, API_KEY, 'updated-value');

      const status = await configStatus(DEV_ORG_ID);
      expect(status.configured).toBe(true);

      const value = await getConfig(DEV_ORG_ID, API_KEY);
      expect(value).toBe('updated-value');

      const rows = await query(
        `SELECT deleted_at FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );
      expect(rows.rows[0].deleted_at).toBeNull();
    });
  });

  describe('C1.12 organization isolation', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.12 config from org A is not accessible from org B', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, TEST_SECRET);

      await expect(getConfig(ORG_B_ID, API_KEY)).rejects.toThrow(NotFoundError);
      const status = await configStatus(ORG_B_ID);
      expect(status.configured).toBe(false);
    });
  });

  describe('C1.13 provider/key uniqueness', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.13 unique constraint on (org, provider, config_key) prevents duplicates', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, 'first');
      await setConfig(DEV_ORG_ID, API_KEY, 'second');

      const rows = await query(
        `SELECT COUNT(*) as cnt
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );

      expect(Number(rows.rows[0].cnt)).toBe(1);

      const value = await getConfig(DEV_ORG_ID, API_KEY);
      expect(value).toBe('second');
    });
  });

  describe('C1.14 status never exposes secrets', () => {
    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1.14 config status response contains no secrets or ciphertext', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, 'SUPER_SECRET_VALUE_12345');
      await setConfig(DEV_ORG_ID, FROM_EMAIL, 'super-secret-email@example.com');

      const status = await configStatus(DEV_ORG_ID);
      const serialized = JSON.stringify(status);

      expect(serialized).not.toContain('SUPER_SECRET_VALUE_12345');
      expect(serialized).not.toContain('super-secret-email');
      expect(serialized).not.toContain('config_value');
      expect(serialized).not.toContain('encrypted');
      expect(status.configured).toBe(true);
    });
  });

  describe('V3.1.2-C1-B Additional Coverage', () => {
    const WHATSAPP_PROVIDER = 'whatsapp';

    beforeEach(async () => {
      await query(`DELETE FROM integration_configs`);
    });

    it('C1-B.11 active update changes encrypted DB value and decrypted result', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, 'value-one');

      const first = await query(
        `SELECT config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );
      const encryptedA = first.rows[0].config_value_encrypted;
      expect(encryptedA).not.toBe('value-one');

      await setConfig(DEV_ORG_ID, API_KEY, 'value-two');

      expect(await getConfig(DEV_ORG_ID, API_KEY)).toBe('value-two');

      const second = await query(
        `SELECT config_value_encrypted
         FROM integration_configs
         WHERE organization_id = $1 AND provider = $2 AND config_key = $3`,
        [DEV_ORG_ID, EMAIL_PROVIDER, API_KEY]
      );
      const encryptedB = second.rows[0].config_value_encrypted;
      expect(encryptedB).not.toBe(encryptedA);
      expect(encryptedB).not.toContain('value-two');
      expect(encryptedB).toMatch(/^v1:/);
    });

    it('C1-B.13 provider/key isolation', async () => {
      await setConfig(DEV_ORG_ID, API_KEY, 'email-api-secret');
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: WHATSAPP_PROVIDER,
        configKey: API_KEY,
        value: 'whatsapp-api-secret',
      });
      await setIntegrationConfig({
        organizationId: DEV_ORG_ID,
        provider: EMAIL_PROVIDER,
        configKey: FROM_EMAIL,
        value: 'from-email-secret',
      });

      expect(await getConfig(DEV_ORG_ID, API_KEY)).toBe('email-api-secret');
      expect(
        await getIntegrationConfig({
          organizationId: DEV_ORG_ID,
          provider: WHATSAPP_PROVIDER,
          configKey: API_KEY,
        })
      ).toBe('whatsapp-api-secret');
      expect(await getConfig(DEV_ORG_ID, FROM_EMAIL)).toBe('from-email-secret');

      const all = await query(
        `SELECT provider, config_key
         FROM integration_configs
         WHERE organization_id = $1 AND deleted_at IS NULL
         ORDER BY provider, config_key`,
        [DEV_ORG_ID]
      );
      expect(all.rowCount).toBe(3);
      expect(all.rows.map((r) => `${r.provider}:${r.config_key}`)).toEqual([
        `${EMAIL_PROVIDER}:${API_KEY}`,
        `${EMAIL_PROVIDER}:${FROM_EMAIL}`,
        `${WHATSAPP_PROVIDER}:${API_KEY}`,
      ]);
    });
  });
});
