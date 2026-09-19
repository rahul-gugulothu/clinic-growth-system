import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  deriveKeyFromHex,
  KEY_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  CIPHERTEXT_VERSION,
} from '../src/utils/crypto.js';

const TEST_KEY_HEX =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const TEST_KEY = deriveKeyFromHex(TEST_KEY_HEX);

const splitCiphertext = (ciphertext: string) => ciphertext.split(':');

describe('V3.1.2-C1 Crypto Utilities', () => {
  describe('C1.1 round trip', () => {
    const inputs = [
      'hello',
      '',
      'with spaces & special !@#$',
      'héllo 🚀 日本語',
      'a'.repeat(1000),
    ];

    for (const input of inputs) {
      it(`decrypts back to original (${input.length} chars)`, () => {
        const encrypted = encryptSecret(input, TEST_KEY);
        expect(decryptSecret(encrypted, TEST_KEY)).toBe(input);
      });
    }
  });

  describe('C1.2 randomized ciphertext', () => {
    it('same plaintext produces different ciphertext with a new random IV', () => {
      const plaintext = 'api-secret-value';
      const a = encryptSecret(plaintext, TEST_KEY);
      const b = encryptSecret(plaintext, TEST_KEY);

      expect(a).not.toBe(b);

      const [vA, ivA, , ctA] = splitCiphertext(a);
      const [vB, ivB, , ctB] = splitCiphertext(b);

      expect(vA).toBe(vB);
      expect(ivA).not.toBe(ivB);
      expect(ctA).not.toBe(ctB);

      expect(decryptSecret(a, TEST_KEY)).toBe(plaintext);
      expect(decryptSecret(b, TEST_KEY)).toBe(plaintext);
    });

    it('produces a fresh 12-byte IV each call', () => {
      const encrypted = encryptSecret('payload', TEST_KEY);
      const [, ivHex] = splitCiphertext(encrypted);

      expect(ivHex.length).toBe(IV_LENGTH * 2);
      const ivs = new Set(
        Array.from({ length: 20 }, () => splitCiphertext(encryptSecret('x', TEST_KEY))[1])
      );
      expect(ivs.size).toBe(20);
    });
  });

  describe('C1.3 v1 format parsing', () => {
    it('uses versioned format v1:<iv>:<authTag>:<ciphertext>', () => {
      const encrypted = encryptSecret('secret', TEST_KEY);
      const parts = splitCiphertext(encrypted);

      expect(parts.length).toBe(4);
      expect(parts[0]).toBe(CIPHERTEXT_VERSION);
      expect(parts[1].length).toBe(IV_LENGTH * 2);
      expect(parts[2].length).toBe(AUTH_TAG_LENGTH * 2);
    });

    it('rejects unsupported ciphertext version', () => {
      const encrypted = encryptSecret('secret', TEST_KEY);
      const parts = splitCiphertext(encrypted);
      const upgraded = `v2:${parts[1]}:${parts[2]}:${parts[3]}`;

      expect(() => decryptSecret(upgraded, TEST_KEY)).toThrow(/Unsupported ciphertext version/);
    });
  });

  describe('C1.4 tampered ciphertext rejected', () => {
    it('tampered auth tag fails decryption', () => {
      const encrypted = encryptSecret('secret', TEST_KEY);
      const parts = splitCiphertext(encrypted);
      const tampered = `${parts[0]}:${parts[1]}:${'0'.repeat(AUTH_TAG_LENGTH * 2)}:${parts[3]}`;

      expect(() => decryptSecret(tampered, TEST_KEY)).toThrow();
    });

    it('tampered ciphertext fails decryption', () => {
      const encrypted = encryptSecret('secret', TEST_KEY);
      const parts = splitCiphertext(encrypted);
      const zeroed = '0'.repeat(parts[3].length);
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${zeroed}`;

      expect(() => decryptSecret(tampered, TEST_KEY)).toThrow();
    });

    it('tampered IV fails decryption', () => {
      const encrypted = encryptSecret('secret', TEST_KEY);
      const parts = splitCiphertext(encrypted);
      const tampered = `${parts[0]}:${'0'.repeat(IV_LENGTH * 2)}:${parts[2]}:${parts[3]}`;

      expect(() => decryptSecret(tampered, TEST_KEY)).toThrow();
    });
  });

  describe('C1.5 invalid ciphertext rejected', () => {
    const invalidCiphertexts = [
      '',
      'not-a-ciphertext',
      'v1:only:two',
      'v1:iv:tag:ct:extra',
      'v1:::',
      'v1:ZZ:ZZ:ZZ',
      'v1:abcdef:abcdef:abcdef',
    ];

    for (const ciphertext of invalidCiphertexts) {
      it(`rejects malformed input: "${ciphertext.slice(0, 24)}"`, () => {
        expect(() => decryptSecret(ciphertext, TEST_KEY)).toThrow();
      });
    }
  });

  describe('C1.6 invalid / missing key rejected', () => {
    it('encryptSecret rejects key shorter than 32 bytes', () => {
      expect(() => encryptSecret('value', Buffer.alloc(KEY_LENGTH - 1))).toThrow(
        /Encryption key must be/
      );
    });

    it('decryptSecret rejects key shorter than 32 bytes', () => {
      const validCiphertext = encryptSecret('value', TEST_KEY);
      expect(() => decryptSecret(validCiphertext, Buffer.alloc(KEY_LENGTH - 1))).toThrow(
        /Encryption key must be/
      );
    });

    it('deriveKeyFromHex rejects empty key', () => {
      expect(() => deriveKeyFromHex('')).toThrow(/Encryption key must be/);
    });

    it('deriveKeyFromHex rejects short key', () => {
      expect(() => deriveKeyFromHex('ab')).toThrow(/Encryption key must be/);
    });

    it('deriveKeyFromHex rejects odd-length hex', () => {
      const oddHex = 'a'.repeat(KEY_LENGTH * 2 - 1);
      expect(() => deriveKeyFromHex(oddHex)).toThrow(/Encryption key must be/);
    });
  });
});
