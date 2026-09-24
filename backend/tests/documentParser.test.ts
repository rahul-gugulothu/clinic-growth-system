import { describe, it, expect } from 'vitest';
import { parseDocument, validateDocument, DocumentParseError } from '../src/services/documentParser.js';
import {
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE,
  isSupportedMimeType,
} from '../src/types/founderKnowledge.js';

describe('documentParser', () => {
  const createBuffer = (text: string): Uint8Array => {
    return new TextEncoder().encode(text);
  };

  describe('validateDocument', () => {
    it('returns valid for supported MIME types and size', () => {
      const buffer = createBuffer('test content');
      const result = validateDocument(buffer, 'text/plain');
      expect(result.valid).toBe(true);
    });

    it('rejects unsupported MIME type', () => {
      const buffer = createBuffer('test content');
      const result = validateDocument(buffer, 'application/unsupported');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });

    it('rejects empty file', () => {
      const buffer = new Uint8Array(0);
      const result = validateDocument(buffer, 'text/plain');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('rejects file exceeding max size', () => {
      const buffer = new Uint8Array(MAX_FILE_SIZE + 1);
      const result = validateDocument(buffer, 'text/plain');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('accepts all supported MIME types', () => {
      const buffer = createBuffer('test');
      for (const mimeType of SUPPORTED_MIME_TYPES) {
        const result = validateDocument(buffer, mimeType);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('isSupportedMimeType', () => {
    it('returns true for supported types', () => {
      expect(isSupportedMimeType('application/pdf')).toBe(true);
      expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
      expect(isSupportedMimeType('text/plain')).toBe(true);
      expect(isSupportedMimeType('text/markdown')).toBe(true);
    });

    it('returns false for unsupported types', () => {
      expect(isSupportedMimeType('application/unknown')).toBe(false);
      expect(isSupportedMimeType('image/png')).toBe(false);
      expect(isSupportedMimeType('')).toBe(false);
    });
  });

  describe('parseDocument', () => {
    it('parses text/plain successfully', async () => {
      const buffer = createBuffer('Hello world from text file');
      const result = await parseDocument(buffer, 'text/plain');
      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello world from text file');
    });

    it('parses text/markdown successfully', async () => {
      const buffer = createBuffer('# Header\n\nSome markdown content');
      const result = await parseDocument(buffer, 'text/markdown');
      expect(result.success).toBe(true);
      expect(result.text).toContain('Header');
      expect(result.text).toContain('markdown content');
    });

    it('rejects unsupported MIME type', async () => {
      const buffer = createBuffer('test');
      const result = await parseDocument(buffer, 'application/unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
    });

    it('rejects file exceeding max size', async () => {
      const buffer = new Uint8Array(MAX_FILE_SIZE + 1);
      const result = await parseDocument(buffer, 'text/plain');
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('rejects empty text content', async () => {
      const buffer = createBuffer('   \n\n  ');
      const result = await parseDocument(buffer, 'text/plain');
      expect(result.success).toBe(false);
      expect(result.error).toContain('no extractable text');
    });

    it('handles UTF-8 encoding correctly', async () => {
      const buffer = createBuffer('Hello 🌍 world');
      const result = await parseDocument(buffer, 'text/plain');
      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello 🌍 world');
    });
  });

  describe('DocumentParseError', () => {
    it('includes mimeType in error', () => {
      const error = new DocumentParseError('Test error', 'application/pdf');
      expect(error.message).toBe('Test error');
      expect(error.mimeType).toBe('application/pdf');
      expect(error.name).toBe('DocumentParseError');
    });
  });
});