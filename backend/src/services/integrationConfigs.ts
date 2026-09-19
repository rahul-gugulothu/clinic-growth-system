import { getClient } from '../db/index.js';
import { config } from '../config/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { encryptSecret, decryptSecret, deriveKeyFromHex } from '../utils/crypto.js';

interface SetIntegrationConfigParams {
  organizationId: string;
  provider: string;
  configKey: string;
  value: string;
}

interface GetIntegrationConfigParams {
  organizationId: string;
  provider: string;
  configKey: string;
}

interface DeleteIntegrationConfigParams {
  organizationId: string;
  provider: string;
  configKey: string;
}

interface GetIntegrationConfigStatusParams {
  organizationId: string;
  provider: string;
}

export interface IntegrationConfigStatus {
  configured: boolean;
}

const getEncryptionKey = (): Buffer => {
  const keyHex = config.integration?.encryptionKey;
  if (!keyHex) {
    throw new BadRequestError(
      'Integration encryption key is not configured'
    );
  }
  return deriveKeyFromHex(keyHex);
};

export const setIntegrationConfig = async (
  params: SetIntegrationConfigParams
): Promise<void> => {
  const key = getEncryptionKey();
  const encryptedValue = encryptSecret(params.value, key);

  const client = await getClient();

  try {
    await client.query(
      `INSERT INTO integration_configs
         (organization_id, provider, config_key, config_value_encrypted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, provider, config_key)
       DO UPDATE SET
         config_value_encrypted = EXCLUDED.config_value_encrypted,
         deleted_at = NULL,
         updated_at = NOW()`,
      [
        params.organizationId,
        params.provider,
        params.configKey,
        encryptedValue,
      ]
    );
  } finally {
    client.release();
  }
};

export const getIntegrationConfig = async (
  params: GetIntegrationConfigParams
): Promise<string> => {
  const key = getEncryptionKey();

  const client = await getClient();

  try {
    const result = await client.query<{ config_value_encrypted: string }>(
      `SELECT config_value_encrypted
       FROM integration_configs
       WHERE organization_id = $1
         AND provider = $2
         AND config_key = $3
         AND deleted_at IS NULL`,
      [params.organizationId, params.provider, params.configKey]
    );

    if (result.rowCount !== 1) {
      throw new NotFoundError(
        `Integration config not found for provider '${params.provider}' key '${params.configKey}'`
      );
    }

    return decryptSecret(result.rows[0].config_value_encrypted, key);
  } finally {
    client.release();
  }
};

export const deleteIntegrationConfig = async (
  params: DeleteIntegrationConfigParams
): Promise<void> => {
  const client = await getClient();

  try {
    await client.query(
      `UPDATE integration_configs
          SET deleted_at = NOW(),
              updated_at = NOW()
       WHERE organization_id = $1
         AND provider = $2
         AND config_key = $3
         AND deleted_at IS NULL`,
      [params.organizationId, params.provider, params.configKey]
    );
  } finally {
    client.release();
  }
};

export const getIntegrationConfigStatus = async (
  params: GetIntegrationConfigStatusParams
): Promise<IntegrationConfigStatus> => {
  const client = await getClient();

  try {
    const result = await client.query(
      `SELECT 1
       FROM integration_configs
       WHERE organization_id = $1
         AND provider = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [params.organizationId, params.provider]
    );

    return { configured: (result.rowCount ?? 0) > 0 };
  } finally {
    client.release();
  }
};
