import { describe, it, expect } from 'vitest';
import { createExcerpt, buildCitations } from '../src/services/retrieval/citations.js';
import type { RetrievedChunk } from '../src/services/retrieval/vectorSearch.js';

describe('Citation Builder', () => {
  describe('createExcerpt', () => {
    it('should return empty string for empty input', () => {
      expect(createExcerpt('')).toBe('');
    });

    it('should return cleaned text unchanged if shorter than maxLength', () => {
      const text = '  Short excerpt text.  ';
      expect(createExcerpt(text, 50)).toBe('Short excerpt text.');
    });

    it('should collapse multiple whitespace and newlines into single spaces', () => {
      const text = 'First line.\n\nSecond line   with   spaces.\tThird line.';
      expect(createExcerpt(text, 100)).toBe('First line. Second line with spaces. Third line.');
    });

    it('should truncate long text to maxLength and append ellipsis', () => {
      const longText = 'A'.repeat(300);
      const excerpt = createExcerpt(longText, 150);
      expect(excerpt.length).toBe(153); // 150 chars + "..."
      expect(excerpt.endsWith('...')).toBe(true);
    });
  });

  describe('buildCitations', () => {
    const sampleChunks: RetrievedChunk[] = [
      {
        documentId: 'doc-1',
        documentName: 'Clinic SOP.pdf',
        chunkId: 'chunk-101',
        chunkIndex: 2,
        similarityScore: 0.876543,
        content: 'Call back incoming leads within 5 minutes of receipt.',
      },
      {
        documentId: 'doc-2',
        documentName: 'Pricing Guide.docx',
        chunkId: 'chunk-202',
        chunkIndex: 0,
        similarityScore: 0.765432,
        content: 'Standard consult package is $250 with initial assessment included.',
      },
    ];

    it('should return empty array for empty or undefined chunk list', () => {
      expect(buildCitations([])).toEqual([]);
    });

    it('should build citations with clean excerpt and rounded similarityScore', () => {
      const citations = buildCitations(sampleChunks);

      expect(citations.length).toBe(2);
      expect(citations[0]).toEqual({
        documentId: 'doc-1',
        documentName: 'Clinic SOP.pdf',
        chunkIndex: 2,
        similarityScore: 0.8765,
        excerpt: 'Call back incoming leads within 5 minutes of receipt.',
      });

      expect(citations[1]).toEqual({
        documentId: 'doc-2',
        documentName: 'Pricing Guide.docx',
        chunkIndex: 0,
        similarityScore: 0.7654,
        excerpt: 'Standard consult package is $250 with initial assessment included.',
      });
    });

    it('should correctly truncate long chunk content in citation excerpt', () => {
      const longChunk: RetrievedChunk = {
        documentId: 'doc-3',
        documentName: 'Long Doc.txt',
        chunkId: 'chunk-303',
        chunkIndex: 0,
        similarityScore: 0.95,
        content: 'Very long text '.repeat(30),
      };

      const citations = buildCitations([longChunk]);

      expect(citations[0].excerpt.endsWith('...')).toBe(true);
      expect(citations[0].excerpt.length).toBeLessThanOrEqual(183);
    });
  });
});
