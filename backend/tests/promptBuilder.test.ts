import { describe, it, expect } from 'vitest';
import { buildFounderRagPrompt } from '../src/services/retrieval/promptBuilder.js';
import type { RetrievedChunk } from '../src/services/retrieval/vectorSearch.js';

describe('Prompt Builder for Founder RAG', () => {
  const sampleChunk1: RetrievedChunk = {
    documentId: 'doc-1',
    documentName: 'Growth Playbook.pdf',
    chunkId: 'chunk-1',
    chunkIndex: 0,
    similarityScore: 0.92,
    content: 'Focus on high-converting patient acquisition channels.',
  };

  const sampleChunk2: RetrievedChunk = {
    documentId: 'doc-1',
    documentName: 'Growth Playbook.pdf',
    chunkId: 'chunk-2',
    chunkIndex: 1,
    similarityScore: 0.88,
    content: 'Optimize clinic reception script for immediate booking.',
  };

  it('should order messages correctly: System Prompt -> Context -> History -> User Message', () => {
    const result = buildFounderRagPrompt({
      systemPrompt: 'You are Founder AI.',
      chunks: [sampleChunk1],
      historyMessages: [
        { role: 'user', content: 'What is our growth strategy?' },
        { role: 'assistant', content: 'We focus on clinic expansion.' },
      ],
      latestUserMessage: 'How do we improve reception conversion?',
    });

    expect(result.messages.length).toBe(4);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('You are Founder AI.');
    expect(result.messages[0].content).toContain('Context Information from Founder Knowledge Base:');
    expect(result.messages[0].content).toContain('Growth Playbook.pdf');
    expect(result.messages[1]).toEqual({ role: 'user', content: 'What is our growth strategy?' });
    expect(result.messages[2]).toEqual({ role: 'assistant', content: 'We focus on clinic expansion.' });
    expect(result.messages[3]).toEqual({ role: 'user', content: 'How do we improve reception conversion?' });
  });

  it('should deduplicate repeated chunks with identical chunkId or content', () => {
    const duplicateChunk: RetrievedChunk = {
      ...sampleChunk1,
      similarityScore: 0.91,
    };

    const identicalContentChunk: RetrievedChunk = {
      documentId: 'doc-2',
      documentName: 'Duplicate.txt',
      chunkId: 'chunk-99',
      chunkIndex: 0,
      similarityScore: 0.85,
      content: sampleChunk1.content,
    };

    const result = buildFounderRagPrompt({
      systemPrompt: 'You are Founder AI.',
      chunks: [sampleChunk1, duplicateChunk, identicalContentChunk, sampleChunk2],
      historyMessages: [],
      latestUserMessage: 'Test query',
    });

    expect(result.retrievedChunks.length).toBe(2);
    expect(result.retrievedChunks.map((c) => c.chunkId)).toEqual(['chunk-1', 'chunk-2']);
  });

  it('should truncate context block when total length exceeds maxContextLength', () => {
    const longChunk1: RetrievedChunk = {
      ...sampleChunk1,
      content: 'A'.repeat(300),
    };
    const longChunk2: RetrievedChunk = {
      ...sampleChunk2,
      content: 'B'.repeat(300),
    };

    const result = buildFounderRagPrompt({
      systemPrompt: 'System',
      chunks: [longChunk1, longChunk2],
      historyMessages: [],
      latestUserMessage: 'Test',
      maxContextLength: 350,
    });

    expect(result.retrievedChunks.length).toBe(1);
    expect(result.retrievedChunks[0].chunkId).toBe('chunk-1');
  });

  it('should format system prompt without context block when chunks array is empty', () => {
    const result = buildFounderRagPrompt({
      systemPrompt: 'You are Founder AI.',
      chunks: [],
      historyMessages: [],
      latestUserMessage: 'Hello Founder AI',
    });

    expect(result.messages.length).toBe(2);
    expect(result.messages[0].content).toBe('You are Founder AI.');
    expect(result.messages[0].content).not.toContain('Context Information');
    expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello Founder AI' });
  });

  it('should avoid duplicating latest user message if it is already the last history message', () => {
    const result = buildFounderRagPrompt({
      systemPrompt: 'System',
      chunks: [],
      historyMessages: [
        { role: 'user', content: 'First message' },
        { role: 'user', content: 'Same user message' },
      ],
      latestUserMessage: 'Same user message',
    });

    expect(result.messages.length).toBe(3); // system + 2 history (no 3rd user message appended)
    expect(result.messages[2]).toEqual({ role: 'user', content: 'Same user message' });
  });

  it('should preserve chunk metadata in retrievedChunks output', () => {
    const result = buildFounderRagPrompt({
      systemPrompt: 'System',
      chunks: [sampleChunk1, sampleChunk2],
      historyMessages: [],
      latestUserMessage: 'Query',
    });

    expect(result.retrievedChunks).toHaveLength(2);
    expect(result.retrievedChunks[0]).toEqual(sampleChunk1);
    expect(result.retrievedChunks[1]).toEqual(sampleChunk2);
  });
});
