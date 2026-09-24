import { logger } from '../utils/logger.js';
import { CHUNK_TARGET_TOKENS, CHUNK_OVERLAP_TOKENS } from '../types/founderKnowledge.js';

export interface Chunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
}

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoSentences(text: string): string[] {
  const sentenceEndings = /[.!?]+\s+/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndings.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    const sentence = text.slice(lastIndex, endIndex).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    lastIndex = endIndex;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 0) {
    sentences.push(remaining);
  }

  return sentences.length > 0 ? sentences : [text];
}

function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

export function createChunks(
  text: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const targetTokens = options.targetTokens ?? CHUNK_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? CHUNK_OVERLAP_TOKENS;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const sentences = splitIntoSentences(text);
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentTokenCount = 0;
  let chunkIndex = 0;
  let overlapBuffer = '';

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);

    if (sentenceTokens > targetTokens) {
      const words = splitIntoWords(sentence);

      for (const word of words) {
        const wordTokens = estimateTokenCount(word + ' ');

        if (currentTokenCount + wordTokens > targetTokens && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            tokenCount: currentTokenCount,
            chunkIndex: chunkIndex++,
          });

          overlapBuffer = getOverlapText(currentChunk, overlapTokens);
          currentChunk = overlapBuffer + word + ' ';
          currentTokenCount = estimateTokenCount(currentChunk);
        } else {
          currentChunk += word + ' ';
          currentTokenCount += wordTokens;
        }
      }
    } else if (currentTokenCount + sentenceTokens > targetTokens && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokenCount,
        chunkIndex: chunkIndex++,
      });

      overlapBuffer = getOverlapText(currentChunk, overlapTokens);
      currentChunk = overlapBuffer + sentence + ' ';
      currentTokenCount = estimateTokenCount(currentChunk);
    } else {
      currentChunk += sentence + ' ';
      currentTokenCount += sentenceTokens;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: currentTokenCount,
      chunkIndex: chunkIndex++,
    });
  }

  logger.debug(
    { chunkCount: chunks.length, targetTokens, overlapTokens },
    'Document chunked successfully'
  );

  return chunks;
}

function getOverlapText(text: string, overlapTokens: number): string {
  const words = splitIntoWords(text);
  if (words.length === 0) return '';

  let overlapText = '';
  let tokenCount = 0;

  for (let i = words.length - 1; i >= 0; i--) {
    const wordTokens = estimateTokenCount(words[i] + ' ');
    if (tokenCount + wordTokens > overlapTokens) break;
    overlapText = words[i] + ' ' + overlapText;
    tokenCount += wordTokens;
  }

  return overlapText.trim() + (overlapText ? ' ' : '');
}

export function validateChunks(chunks: Chunk[]): { valid: boolean; error?: string } {
  if (chunks.length === 0) {
    return { valid: false, error: 'No chunks generated from document' };
  }

  for (const chunk of chunks) {
    if (!chunk.content || chunk.content.trim().length === 0) {
      return { valid: false, error: 'Empty chunk found' };
    }
    if (chunk.tokenCount <= 0) {
      return { valid: false, error: 'Invalid token count in chunk' };
    }
  }

  return { valid: true };
}