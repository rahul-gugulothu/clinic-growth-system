import { z } from 'zod';
import { httpRequest, HttpError, type HttpResponse } from '../../utils/httpClient.js';
import { getIntegrationConfig } from '../integrationConfigs.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export type LLMProvider = 'mock' | 'openai';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
}

export interface LLMResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMStreamChunk {
  content: string;
  isFirst: boolean;
  isLast: boolean;
}

export interface LLMClient {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>;
  generateCompletionStream?(
    request: LLMRequest,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk>;
}

export class LLMError extends Error {
  readonly kind: 'timeout' | 'network' | 'api_error' | 'parse_error' | 'config_error';
  readonly statusCode?: number;

  constructor(
    message: string,
    kind: 'timeout' | 'network' | 'api_error' | 'parse_error' | 'config_error',
    statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
    this.kind = kind;
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
  }
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAIClient implements LLMClient {
  private readonly apiKey: string;
  private readonly organizationId: string;

  constructor(params: { apiKey: string; organizationId: string }) {
    this.apiKey = params.apiKey;
    this.organizationId = params.organizationId;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const provider = 'openai';

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      const messages = request.messages
        ? request.messages
        : [
            {
              role: 'system',
              content:
                request.systemPrompt ||
                'You are a helpful assistant that produces structured JSON.',
            },
            { role: 'user', content: request.prompt },
          ];

      const body = JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.3,
        response_format: { type: 'json_object' },
      });

      let response: HttpResponse;
      try {
        response = await httpRequest(OPENAI_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          returnBody: true,
        });
      } catch (err) {
        if (err instanceof HttpError) {
          if (err.kind === 'timeout') {
            throw new LLMError('LLM request timed out', 'timeout');
          }
          throw new LLMError('Network error contacting LLM provider', 'network');
        }
        throw new LLMError(
          err instanceof Error ? err.message : 'Unknown LLM error',
          'network'
        );
      }

      if (response.status !== 200) {
        logger.warn(
          {
            organizationId: this.organizationId,
            statusCode: response.status,
            body: response.body,
          },
          'OpenAI API returned non-200 response'
        );

        if (response.status === 401) {
          throw new LLMError('Invalid LLM API key', 'config_error', 401);
        }
        if (response.status === 429) {
          throw new LLMError('LLM provider rate limited', 'api_error', 429);
        }
        if (response.status >= 500) {
          throw new LLMError(
            `LLM provider server error (status ${response.status})`,
            'api_error',
            response.status
          );
        }
        throw new LLMError(
          `LLM API error (status ${response.status})`,
          'api_error',
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError('LLM returned empty response', 'api_error');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new LLMError('LLM returned malformed JSON', 'parse_error');
      }

      const result = openAIResponseSchema.safeParse(parsed);
      if (!result.success) {
        throw new LLMError(
          'LLM response missing expected fields',
          'parse_error'
        );
      }

      inputTokens = result.data.usage?.prompt_tokens;
      outputTokens = result.data.usage?.completion_tokens;

      const latencyMs = Date.now() - startTime;
      logger.info(
        {
          provider,
          organizationId: this.organizationId,
          success: true,
          inputTokens,
          outputTokens,
          latencyMs,
        },
        'LLM call completed'
      );

      return {
        content: result.data.choices[0].message.content,
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorKind = err instanceof LLMError ? err.kind : 'unknown';
      logger.info(
        {
          provider,
          organizationId: this.organizationId,
          success: false,
          inputTokens,
          outputTokens,
          latencyMs,
          errorKind,
        },
        'LLM call failed'
      );
       throw err;
    }
  }

  async *generateCompletionStream(
    request: LLMRequest,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    const provider = 'openai';
    const startTime = Date.now();

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    const messages = request.messages
      ? request.messages
      : [
          {
            role: 'system',
            content:
              request.systemPrompt ||
              'You are a helpful assistant that produces structured JSON.',
          },
          { role: 'user', content: request.prompt },
        ];

    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.3,
      response_format: { type: 'json_object' },
      stream: true,
    });

    let response: HttpResponse;
    try {
      response = await httpRequest(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        returnBody: false,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.kind === 'timeout') {
          throw new LLMError('LLM request timed out', 'timeout');
        }
        throw new LLMError('Network error contacting LLM provider', 'network');
      }
      throw new LLMError(
        err instanceof Error ? err.message : 'Unknown LLM error',
        'network'
      );
    }

    if (response.status !== 200) {
      throw new LLMError(
        `LLM API error (status ${response.status})`,
        'api_error',
        response.status
      );
    }

    let isFirst = true;
    let chunkCount = 0;

    for await (const chunk of this.streamSSE(response, signal)) {
      const parsed = this.parseSSEChunk(chunk);
      if (parsed) {
        if (parsed.content) {
          outputTokens = (outputTokens ?? 0) + parsed.content.length;
          yield {
            content: parsed.content,
            isFirst,
            isLast: false,
          };
          isFirst = false;
          chunkCount++;
        }
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens;
          outputTokens = parsed.usage.completion_tokens;
        }
      }
    }

    if (chunkCount === 0) {
      throw new LLMError('LLM stream ended without content', 'parse_error');
    }

    const latencyMs = Date.now() - startTime;
    logger.info(
      {
        provider,
        organizationId: this.organizationId,
        success: true,
        inputTokens,
        outputTokens,
        latencyMs,
      },
      'LLM streaming call completed'
    );

    yield {
      content: '',
      isFirst: false,
      isLast: true,
    };
  }

  private async *streamSSE(
    response: HttpResponse,
    signal?: AbortSignal
  ): AsyncIterable<{ data: string; usage?: { prompt_tokens?: number; completion_tokens?: number }; content?: string }> {
    if (!response.bodyStream) {
      throw new LLMError('No response body stream from LLM provider', 'parse_error');
    }

    if (signal?.aborted) return;

    const reader = response.bodyStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lineEnd: number;
        while ((lineEnd = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          
          // Handle [DONE] marker
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            const content = choice?.delta?.content;
            
            if (content) {
              yield {
                data,
                content,
                usage: parsed.usage,
              };
            } else if (parsed.usage) {
              yield {
                data,
                usage: parsed.usage,
              };
            }
          } catch {
            // Ignore parse errors for malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSSEChunk(chunk: {
    data: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    content?: string;
  }): { content?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } {
    if (chunk.content !== undefined) {
      return { content: chunk.content, usage: chunk.usage };
    }
    try {
      const parsed = JSON.parse(chunk.data);
      const choice = parsed.choices?.[0];
      const content = choice?.delta?.content;
      if (content) {
        return { content, usage: chunk.usage };
      }
      if (parsed.usage) {
        return { usage: parsed.usage };
      }
    } catch {
      return {};
    }
    return {};
  }
}

const openAIResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export class MockLLMClient implements LLMClient {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    void request;
    return {
      content: '{"researchSummary": "Mock summary generated from LLM.", "recommendedNextAction": "Schedule a discovery call with the prospect."}',
      inputTokens: 100,
      outputTokens: 50,
    };
  }

  async *generateCompletionStream(
    request: LLMRequest,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    void request;
    const content = '{"researchSummary": "Mock summary generated from LLM.", "recommendedNextAction": "Schedule a discovery call with the prospect."}';
    const chunks = splitContent(content);
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) return;
      yield {
        content: chunks[i],
        isFirst: i === 0,
        isLast: i === chunks.length - 1,
      };
    }
  }
}

function splitContent(content: string): string[] {
  const chunkSize = 8;
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
}

export const createLLMClient = async (
  organizationId: string
): Promise<LLMClient | undefined> => {
  const provider = process.env.LLM_PROVIDER || 'mock';

  if (provider === 'mock') {
    return new MockLLMClient();
  }

  if (provider === 'openai') {
    try {
      const apiKey = await getIntegrationConfig({
        organizationId,
        provider: 'openai',
        configKey: 'api_key',
      });
      return new OpenAIClient({ apiKey, organizationId });
    } catch (err) {
      if (err instanceof NotFoundError) {
        logger.warn(
          { organizationId, provider: 'openai' },
          'LLM API key not configured for organization; falling back to deterministic logic'
        );
        return undefined;
      }
      logger.error(
        { err, organizationId, provider: 'openai' },
        'Failed to load LLM API key'
      );
      return undefined;
    }
  }

  return undefined;
};
