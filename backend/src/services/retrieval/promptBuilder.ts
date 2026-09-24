import type { RetrievedChunk } from './vectorSearch.js';

export interface BuildFounderRagPromptParams {
  systemPrompt: string;
  chunks: RetrievedChunk[];
  historyMessages: Array<{ role: string; content: string }>;
  latestUserMessage: string;
  maxContextLength?: number;
}

export interface RagPromptResult {
  messages: Array<{ role: string; content: string }>;
  retrievedChunks: RetrievedChunk[];
}

const DEFAULT_MAX_CONTEXT_LENGTH = 4000;

export function buildFounderRagPrompt(params: BuildFounderRagPromptParams): RagPromptResult {
  const {
    systemPrompt,
    chunks,
    historyMessages,
    latestUserMessage,
    maxContextLength = DEFAULT_MAX_CONTEXT_LENGTH,
  } = params;

  // 1. Deduplicate repeated chunks by chunkId or content
  const seenIds = new Set<string>();
  const seenContents = new Set<string>();
  const uniqueChunks: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    if (seenIds.has(chunk.chunkId) || seenContents.has(chunk.content.trim())) {
      continue;
    }
    seenIds.add(chunk.chunkId);
    seenContents.add(chunk.content.trim());
    uniqueChunks.push(chunk);
  }

  // 2. Format retrieved knowledge context up to maxContextLength
  const includedChunks: RetrievedChunk[] = [];
  let contextBlock = '';

  if (uniqueChunks.length > 0) {
    const formattedBlocks: string[] = [];
    let currentLength = 0;

    for (const chunk of uniqueChunks) {
      const block = `Document: ${chunk.documentName} (Chunk ${chunk.chunkIndex})\n${chunk.content}`;
      if (currentLength + block.length > maxContextLength && includedChunks.length > 0) {
        break;
      }
      formattedBlocks.push(block);
      includedChunks.push(chunk);
      currentLength += block.length;
    }

    if (formattedBlocks.length > 0) {
      contextBlock = `Context Information from Founder Knowledge Base:\n\n---\n${formattedBlocks.join('\n---\n')}\n---`;
    }
  }

  // 3. Construct System Prompt + Context
  const combinedSystemContent = contextBlock
    ? `${systemPrompt.trim()}\n\n${contextBlock}`
    : systemPrompt.trim();

  const systemMessage = {
    role: 'system',
    content: combinedSystemContent,
  };

  // 4. Preserve conversation history message order
  const cleanedHistory: Array<{ role: string; content: string }> = [];
  for (const msg of historyMessages) {
    if (msg.role === 'system') continue; // Avoid duplicate system messages from history
    cleanedHistory.push({ role: msg.role, content: msg.content });
  }

  // Avoid duplicating latestUserMessage if it is already the last history message
  const lastHistoryMsg = cleanedHistory[cleanedHistory.length - 1];
  const isDuplicateLastUser =
    lastHistoryMsg &&
    lastHistoryMsg.role === 'user' &&
    lastHistoryMsg.content.trim() === latestUserMessage.trim();

  const finalMessages: Array<{ role: string; content: string }> = [systemMessage];

  if (isDuplicateLastUser) {
    // History includes the latest message as last element
    finalMessages.push(...cleanedHistory);
  } else {
    finalMessages.push(...cleanedHistory);
    if (latestUserMessage && latestUserMessage.trim().length > 0) {
      finalMessages.push({ role: 'user', content: latestUserMessage });
    }
  }

  return {
    messages: finalMessages,
    retrievedChunks: includedChunks,
  };
}
