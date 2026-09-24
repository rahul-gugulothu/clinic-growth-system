import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MockEmbeddingClient,
  OpenAIEmbeddingClient,
  EmbeddingError,
  createEmbeddingClient,
} from '../../src/services/embeddings/client.js';
import * as httpClientModule from '../../src/utils/httpClient.js';
import * as integrationConfigsModule from '../../src/services/integrationConfigs.js';
import { NotFoundError } from '../../src/types/index.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function makeHttpResponse(status: number, body: string): httpClientModule.HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    body,
  };
}

describe('Embedding Clients & Factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('MockEmbeddingClient', () => {
    it('should generate single embedding vector with default 1536 dimensions', async () => {
      const client = new MockEmbeddingClient();
      const res = await client.generateEmbeddings({ text: 'Hello world' });

      expect(res.dimensions).toBe(1536);
      expect(res.embeddings.length).toBe(1);
      expect(res.embeddings[0].length).toBe(1536);
      expect(typeof res.embeddings[0][0]).toBe('number');
      expect(res.inputTokens).toBeGreaterThan(0);
    });

    it('should generate embeddings for multiple input texts', async () => {
      const client = new MockEmbeddingClient();
      const res = await client.generateEmbeddings({
        text: ['Chunk 1 content', 'Chunk 2 content', 'Chunk 3 content'],
      });

      expect(res.dimensions).toBe(1536);
      expect(res.embeddings.length).toBe(3);
      expect(res.embeddings[0].length).toBe(1536);
      expect(res.embeddings[1].length).toBe(1536);
      expect(res.embeddings[2].length).toBe(1536);
    });

    it('should calculate input tokens correctly for batch', async () => {
      const client = new MockEmbeddingClient();
      const res = await client.generateEmbeddings({ text: ['short', 'a longer text content sample'] });
      expect(res.inputTokens).toBeGreaterThan(0);
    });

    it('should support custom vector dimensions', async () => {
      const client = new MockEmbeddingClient(512);
      const res = await client.generateEmbeddings({ text: 'Test text' });

      expect(res.dimensions).toBe(512);
      expect(res.embeddings[0].length).toBe(512);
    });
  });

  describe('OpenAIEmbeddingClient', () => {
    const apiKey = 'sk-mock-test-key-12345';
    const client = new OpenAIEmbeddingClient({ apiKey, organizationId: ORG_ID });

    it('should send correct headers and body to OpenAI embeddings endpoint', async () => {
      const httpRequestSpy = vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(
          200,
          JSON.stringify({
            object: 'list',
            data: [
              {
                object: 'embedding',
                index: 0,
                embedding: [0.1, 0.2, 0.3],
              },
            ],
            model: 'text-embedding-3-small',
            usage: { prompt_tokens: 5 },
          })
        )
      );

      const res = await client.generateEmbeddings({ text: 'Sample text' });

      expect(httpRequestSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: ['Sample text'],
          }),
        })
      );

      expect(res.embeddings).toEqual([[0.1, 0.2, 0.3]]);
      expect(res.dimensions).toBe(3);
      expect(res.inputTokens).toBe(5);
    });

    it('should parse batched response sorted by data index', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(
          200,
          JSON.stringify({
            object: 'list',
            data: [
              { object: 'embedding', index: 1, embedding: [0.4, 0.5, 0.6] },
              { object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] },
            ],
            model: 'text-embedding-3-small',
            usage: { prompt_tokens: 12 },
          })
        )
      );

      const res = await client.generateEmbeddings({ text: ['First', 'Second'] });

      expect(res.embeddings).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
    });

    it('should throw EmbeddingError with kind timeout on request timeout', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockRejectedValue(
        new httpClientModule.HttpError('Request timeout', 'timeout')
      );

      await expect(client.generateEmbeddings({ text: 'Test' })).rejects.toThrow(EmbeddingError);
      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('timeout');
      }
    });

    it('should throw EmbeddingError with kind network on generic network failure', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockRejectedValue(
        new httpClientModule.HttpError('DNS failed', 'network')
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('network');
      }
    });

    it('should throw EmbeddingError with kind config_error on 401 unauthorized', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(401, JSON.stringify({ error: { message: 'Invalid API Key' } }))
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('config_error');
        expect((err as EmbeddingError).statusCode).toBe(401);
      }
    });

    it('should throw EmbeddingError with kind api_error on 429 rate limit', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(429, JSON.stringify({ error: { message: 'Rate limit exceeded' } }))
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('api_error');
        expect((err as EmbeddingError).statusCode).toBe(429);
      }
    });

    it('should throw EmbeddingError with kind api_error on 500 server error', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(500, 'Internal Server Error')
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('api_error');
        expect((err as EmbeddingError).statusCode).toBe(500);
      }
    });

    it('should throw EmbeddingError with kind api_error on empty body', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(makeHttpResponse(200, ''));

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('api_error');
      }
    });

    it('should throw EmbeddingError with kind parse_error on malformed JSON', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(200, '{ malformed json...')
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('parse_error');
      }
    });

    it('should throw EmbeddingError with kind parse_error on invalid response schema', async () => {
      vi.spyOn(httpClientModule, 'httpRequest').mockResolvedValue(
        makeHttpResponse(200, JSON.stringify({ wrongField: true }))
      );

      try {
        await client.generateEmbeddings({ text: 'Test' });
      } catch (err) {
        expect(err).toBeInstanceOf(EmbeddingError);
        expect((err as EmbeddingError).kind).toBe('parse_error');
      }
    });
  });

  describe('createEmbeddingClient Factory', () => {
    it('should return MockEmbeddingClient when EMBEDDING_PROVIDER=mock', async () => {
      process.env.EMBEDDING_PROVIDER = 'mock';
      const client = await createEmbeddingClient(ORG_ID);
      expect(client).toBeInstanceOf(MockEmbeddingClient);
    });

    it('should return OpenAIEmbeddingClient when provider=openai and config exists', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      vi.spyOn(integrationConfigsModule, 'getIntegrationConfig').mockResolvedValue('sk-valid-key');

      const client = await createEmbeddingClient(ORG_ID);
      expect(client).toBeInstanceOf(OpenAIEmbeddingClient);
    });

    it('should return undefined when provider=openai but config is not found', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      vi.spyOn(integrationConfigsModule, 'getIntegrationConfig').mockRejectedValue(
        new NotFoundError('Config not found')
      );

      const client = await createEmbeddingClient(ORG_ID);
      expect(client).toBeUndefined();
    });

    it('should return undefined for unknown provider', async () => {
      process.env.EMBEDDING_PROVIDER = 'unknown-provider';
      const client = await createEmbeddingClient(ORG_ID);
      expect(client).toBeUndefined();
    });
  });
});
