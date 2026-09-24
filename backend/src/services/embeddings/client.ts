import { z } from 'zod';
import { httpRequest, HttpError, type HttpResponse } from '../../utils/httpClient.js';
import { getIntegrationConfig } from '../integrationConfigs.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type {
  EmbeddingClient,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../types/embeddings.js';

export class EmbeddingError extends Error {
  readonly kind: 'timeout' | 'network' | 'api_error' | 'parse_error' | 'config_error';
  readonly statusCode?: number;

  constructor(
    message: string,
    kind: 'timeout' | 'network' | 'api_error' | 'parse_error' | 'config_error',
    statusCode?: number
  ) {
    super(message);
    this.name = 'EmbeddingError';
    this.kind = kind;
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
  }
}

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const DEFAULT_TIMEOUT_MS = 30_000;

export class MockEmbeddingClient implements EmbeddingClient {
  private readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.text) ? request.text : [request.text];

    const embeddings = inputs.map((text) => {
      const vector = new Array(this.dimensions).fill(0);
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = Math.abs(Math.sin(hash + i)) * 0.1 + 0.05;
      }
      return vector;
    });

    const inputTokens = inputs.reduce((acc, text) => acc + Math.ceil(text.length / 4), 0);

    return {
      embeddings,
      dimensions: this.dimensions,
      inputTokens,
    };
  }
}

const openAIEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number(),
      embedding: z.array(z.number()),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
    })
    .optional(),
});

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private readonly apiKey: string;
  private readonly organizationId: string;

  constructor(params: { apiKey: string; organizationId: string }) {
    this.apiKey = params.apiKey;
    this.organizationId = params.organizationId;
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    const provider = 'openai';

    const inputs = Array.isArray(request.text) ? request.text : [request.text];

    try {
      const body = JSON.stringify({
        model: 'text-embedding-3-small',
        input: inputs,
      });

      let response: HttpResponse;
      try {
        response = await httpRequest(OPENAI_EMBEDDINGS_ENDPOINT, {
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
            throw new EmbeddingError('Embedding request timed out', 'timeout');
          }
          throw new EmbeddingError('Network error contacting embedding provider', 'network');
        }
        throw new EmbeddingError(
          err instanceof Error ? err.message : 'Unknown embedding error',
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
          'OpenAI Embedding API returned non-200 response'
        );

        if (response.status === 401) {
          throw new EmbeddingError('Invalid OpenAI API key', 'config_error', 401);
        }
        if (response.status === 429) {
          throw new EmbeddingError('Embedding provider rate limited', 'api_error', 429);
        }
        if (response.status >= 500) {
          throw new EmbeddingError(
            `Embedding provider server error (status ${response.status})`,
            'api_error',
            response.status
          );
        }
        throw new EmbeddingError(
          `Embedding API error (status ${response.status})`,
          'api_error',
          response.status
        );
      }

      if (!response.body) {
        throw new EmbeddingError('Embedding returned empty response', 'api_error');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new EmbeddingError('Embedding returned malformed JSON', 'parse_error');
      }

      const result = openAIEmbeddingResponseSchema.safeParse(parsed);
      if (!result.success) {
        throw new EmbeddingError('Embedding response missing expected fields', 'parse_error');
      }

      const sortedData = result.data.data.sort((a, b) => a.index - b.index);
      const embeddings = sortedData.map((d) => d.embedding);
      const dimensions = embeddings[0]?.length ?? 1536;
      const inputTokens = result.data.usage?.prompt_tokens;

      const latencyMs = Date.now() - startTime;
      logger.info(
        {
          provider,
          organizationId: this.organizationId,
          success: true,
          inputTokens,
          latencyMs,
        },
        'Embedding generation completed'
      );

      return {
        embeddings,
        dimensions,
        inputTokens,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorKind = err instanceof EmbeddingError ? err.kind : 'unknown';
      logger.info(
        {
          provider,
          organizationId: this.organizationId,
          success: false,
          latencyMs,
          errorKind,
        },
        'Embedding generation failed'
      );
      throw err;
    }
  }
}

export const createEmbeddingClient = async (
  organizationId: string
): Promise<EmbeddingClient | undefined> => {
  const provider = process.env.EMBEDDING_PROVIDER || config.embedding?.provider || 'mock';

  if (provider === 'mock') {
    return new MockEmbeddingClient();
  }

  if (provider === 'openai') {
    try {
      const apiKey = await getIntegrationConfig({
        organizationId,
        provider: 'openai',
        configKey: 'api_key',
      });
      return new OpenAIEmbeddingClient({ apiKey, organizationId });
    } catch (err) {
      if (err instanceof NotFoundError) {
        logger.warn(
          { organizationId, provider: 'openai' },
          'OpenAI API key not configured for organization; cannot create embedding client'
        );
        return undefined;
      }
      logger.error(
        { err, organizationId, provider: 'openai' },
        'Failed to load OpenAI API key for embeddings'
      );
      return undefined;
    }
  }

  return undefined;
};
