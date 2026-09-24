import { describe, it, expect } from 'vitest';
import { createChunks, validateChunks, estimateTokenCount } from '../src/services/chunking.js';

describe('chunking', () => {
  describe('estimateTokenCount', () => {
    it('estimates tokens correctly', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount('test')).toBe(1);
      expect(estimateTokenCount('hello world')).toBe(3);
    });
  });

  describe('createChunks', () => {
    it('returns empty array for empty text', () => {
      const chunks = createChunks('');
      expect(chunks).toHaveLength(0);
    });

    it('returns empty array for whitespace only', () => {
      const chunks = createChunks('   \n\n  ');
      expect(chunks).toHaveLength(0);
    });

    it('creates single chunk for short text', () => {
      const text = 'This is a short document.';
      const chunks = createChunks(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].tokenCount).toBeGreaterThan(0);
    });

    it('creates multiple chunks for long text', () => {
      const text = 'This is a sentence. '.repeat(200);
      const chunks = createChunks(text, { targetTokens: 100, overlapTokens: 10 });
      expect(chunks.length).toBeGreaterThan(1);
      
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBe(i);
        expect(chunks[i].tokenCount).toBeGreaterThan(0);
      }
    });

    it('maintains overlap between chunks', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      const chunks = createChunks(text, { targetTokens: 10, overlapTokens: 5 });
      
      if (chunks.length > 1) {
        for (let i = 1; i < chunks.length; i++) {
          const prevWords = chunks[i - 1].content.split(/\s+/).slice(-5).join(' ');
          const currWords = chunks[i].content.split(/\s+/).slice(0, 5).join(' ');
          expect(currWords).toContain(prevWords.split(' ').pop() || '');
        }
      }
    });

    it('handles single long sentence', () => {
      const longWord = 'a'.repeat(500);
      const text = longWord + ' ' + 'second word. third word.';
      const chunks = createChunks(text, { targetTokens: 50, overlapTokens: 10 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('handles markdown text', () => {
      const text = '# Header\n\nParagraph one.\n\n## Subheader\n\nParagraph two with more content to make it longer.';
      const chunks = createChunks(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateChunks', () => {
    it('returns valid for proper chunks', () => {
      const chunks = [
        { content: 'Chunk one', tokenCount: 5, chunkIndex: 0 },
        { content: 'Chunk two', tokenCount: 6, chunkIndex: 1 },
      ];
      const result = validateChunks(chunks);
      expect(result.valid).toBe(true);
    });

    it('rejects empty chunks array', () => {
      const result = validateChunks([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No chunks generated');
    });

    it('rejects chunks with empty content', () => {
      const chunks = [
        { content: 'Valid chunk', tokenCount: 5, chunkIndex: 0 },
        { content: '', tokenCount: 0, chunkIndex: 1 },
      ];
      const result = validateChunks(chunks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Empty chunk');
    });

    it('rejects chunks with invalid token count', () => {
      const chunks = [
        { content: 'Valid chunk', tokenCount: 5, chunkIndex: 0 },
        { content: 'Invalid chunk', tokenCount: -1, chunkIndex: 1 },
      ];
      const result = validateChunks(chunks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token count');
    });
  });
});