import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const CRYPTO_ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH = 12;
export const KEY_LENGTH = 32;
export const AUTH_TAG_LENGTH = 16;
export const CIPHERTEXT_VERSION = 'v1';

const formatError = (message: string): Error => new Error(message);

export const encryptSecret = (plaintext: string, key: Buffer): string => {
  if (key.length !== KEY_LENGTH) {
    throw formatError(
      `Encryption key must be ${KEY_LENGTH} bytes; received ${key.length}`
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CRYPTO_ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    CIPHERTEXT_VERSION,
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext.toString('hex'),
  ].join(':');
};

export const decryptSecret = (ciphertext: string, key: Buffer): string => {
  if (key.length !== KEY_LENGTH) {
    throw formatError(
      `Encryption key must be ${KEY_LENGTH} bytes; received ${key.length}`
    );
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw formatError('Invalid ciphertext format: expected 4 parts');
  }

  const [version, ivHex, tagHex, encryptedHex] = parts;
  if (version !== CIPHERTEXT_VERSION) {
    throw formatError(`Unsupported ciphertext version: ${version}`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== IV_LENGTH) {
    throw formatError('Invalid IV length in ciphertext');
  }

  const authTag = Buffer.from(tagHex, 'hex');
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw formatError('Invalid auth tag length in ciphertext');
  }

  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(CRYPTO_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

export const deriveKeyFromHex = (hexKey: string): Buffer => {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw formatError(
      `Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`
    );
  }
  return key;
};
