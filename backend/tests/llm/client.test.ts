import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, type HttpResponse } from '../../src/utils/httpClient.js';
import { NotFoundError } from '../../src/types/index.js';
import type { LLMResponse } from '../../src/services/llm/client.js';

vi.mock('../../src/utils/httpClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/httpClient.js')>();
  return { ...actual, httpRequest: vi.fn() };
});

vi.mock('../../src/services/integrationConfigs.js', () => ({
  getIntegrationConfig: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { httpRequest } from '../../src/utils/httpClient.js';
import { getIntegrationConfig } from '../../src/services/integrationConfigs.js';
import {
  MockLLMClient,
  OpenAIClient,
  LLMError,
  createLLMClient,
} from '../../src/services/llm/client.js';

const mockedHttpRequest = vi.mocked(httpRequest);
const mockedGetIntegrationConfig = vi.mocked(getIntegrationConfig);

describe('V3.1.10 LLM Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.LLM_PROVIDER;
  });

  describe('A. MockLLMClient', () => {
    it('generateCompletion returns deterministic output', async () => {
      const client = new MockLLMClient();
      const response = await client.generateCompletion({ prompt: 'test' });

      expect(response.content).toContain('"researchSummary"');
      expect(response.content).toContain('Mock summary generated from LLM');
      expect(response.content).toContain('"recommendedNextAction"');
    });

    it('response shape is correct', async () => {
      const client = new MockLLMClient();
      const response: LLMResponse = await client.generateCompletion({
        prompt: 'test prompt',
        systemPrompt: 'system',
        maxTokens: 100,
        temperature: 0.5,
      });

      expect(response).toHaveProperty('content');
      expect(typeof response.content).toBe('string');
      expect(response).toHaveProperty('inputTokens');
      expect(response).toHaveProperty('outputTokens');
      expect(response.inputTokens).toBe(100);
      expect(response.outputTokens).toBe(50);
    });

    it('ignores request parameters and always returns the same output', async () => {
      const client = new MockLLMClient();
      const response1 = await client.generateCompletion({ prompt: 'query 1' });
      const response2 = await client.generateCompletion({ prompt: 'query 2' });

      expect(response1.content).toBe(response2.content);
    });
  });

  describe('B. OpenAIClient', () => {
    const openaiClient = new OpenAIClient({
      apiKey: 'sk-test-openai-key',
      organizationId: '00000000-0000-0000-0000-000000000001',
    });

    it('successful HTTP response is parsed correctly', async () => {
      const openAiResponse = {
        choices: [{ message: { content: '{"result": "success"}' } }],
        usage: { prompt_tokens: 50, completion_tokens: 25 },
      };

      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify(openAiResponse),
      } as HttpResponse);

      const response = await openaiClient.generateCompletion({
        prompt: 'Summarize this clinic',
      });

      expect(response.content).toBe('{"result": "success"}');
      expect(response.inputTokens).toBe(50);
      expect(response.outputTokens).toBe(25);
    });

    it('content is extracted correctly from response', async () => {
      const openAiResponse = {
        choices: [
          {
            message: {
              content: '{"researchSummary": "Test summary", "recommendedNextAction": "Call them"}',
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };

      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify(openAiResponse),
      } as HttpResponse);

      const response = await openaiClient.generateCompletion({ prompt: 'test' });

      expect(response.content).toBe(
        '{"researchSummary": "Test summary", "recommendedNextAction": "Call them"}'
      );
    });

    it('usage/inputTokens/outputTokens are mapped correctly', async () => {
      const openAiResponse = {
        choices: [{ message: { content: '{"result": "ok"}' } }],
        usage: { prompt_tokens: 150, completion_tokens: 75 },
      };

      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify(openAiResponse),
      } as HttpResponse);

      const response = await openaiClient.generateCompletion({ prompt: 'test' });

      expect(response.inputTokens).toBe(150);
      expect(response.outputTokens).toBe(75);
    });

    it('missing usage field does not cause an error', async () => {
      const openAiResponse = {
        choices: [{ message: { content: '{"result": "ok"}' } }],
      };

      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify(openAiResponse),
      } as HttpResponse);

      const response = await openaiClient.generateCompletion({ prompt: 'test' });

      expect(response.content).toBe('{"result": "ok"}');
      expect(response.inputTokens).toBeUndefined();
      expect(response.outputTokens).toBeUndefined();
    });

    it('malformed response (non-JSON body) is rejected with parse_error', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: 'This is not JSON{{',
      } as HttpResponse);

      await expect(openaiClient.generateCompletion({ prompt: 'test' })).rejects.toThrow(
        LLMError
      );

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('parse_error');
      }
    });

    it('malformed response (missing choices) is rejected with parse_error', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify({ unexpected: 'structure' }),
      } as HttpResponse);

      await expect(openaiClient.generateCompletion({ prompt: 'test' })).rejects.toThrow(
        LLMError
      );

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('parse_error');
      }
    });

    it('non-2xx HTTP response becomes the appropriate LLMError', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 500,
        ok: false,
        headers: { get: () => null },
        body: 'Internal Server Error',
      } as HttpResponse);

      await expect(openaiClient.generateCompletion({ prompt: 'test' })).rejects.toThrow(
        LLMError
      );

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('api_error');
        expect((err as LLMError).statusCode).toBe(500);
      }
    });

    it('401 response becomes config_error LLMError', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 401,
        ok: false,
        headers: { get: () => null },
        body: 'Unauthorized',
      } as HttpResponse);

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
        expect.fail('Expected LLMError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('config_error');
        expect((err as LLMError).statusCode).toBe(401);
      }
    });

    it('429 response becomes api_error LLMError', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 429,
        ok: false,
        headers: { get: () => null },
        body: 'Rate Limited',
      } as HttpResponse);

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
        expect.fail('Expected LLMError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('api_error');
        expect((err as LLMError).statusCode).toBe(429);
      }
    });

    it('timeout error is mapped correctly', async () => {
      mockedHttpRequest.mockRejectedValue(new HttpError('Request timed out', 'timeout'));

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
        expect.fail('Expected LLMError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('timeout');
      }
    });

    it('network error is mapped correctly', async () => {
      mockedHttpRequest.mockRejectedValue(new HttpError('ECONNREFUSED', 'network'));

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
        expect.fail('Expected LLMError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('network');
      }
    });

    it('empty response body becomes api_error LLMError', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: null,
      } as HttpResponse);

      try {
        await openaiClient.generateCompletion({ prompt: 'test' });
        expect.fail('Expected LLMError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe('api_error');
      }
    });

    it('sends correct request body with model, messages, and headers', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify({
          choices: [{ message: { content: '{"result": "ok"}' } }],
        }),
      } as HttpResponse);

      await openaiClient.generateCompletion({
        prompt: 'Hello LLM',
        systemPrompt: 'You are a helpful assistant',
        maxTokens: 256,
        temperature: 0.7,
      });

      expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
      const [url, options] = mockedHttpRequest.mock.calls[0] as [
        string,
        { method?: string; headers?: Record<string, string>; body?: string }
      ];

      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers?.Authorization).toBe('Bearer sk-test-openai-key');
      expect(options.headers?.['Content-Type']).toBe('application/json');
      expect(options.body).toBeDefined();

      const parsedBody = JSON.parse(options.body as string);
      expect(parsedBody.model).toBe('gpt-4o-mini');
      expect(parsedBody.messages).toHaveLength(2);
      expect(parsedBody.messages[0].role).toBe('system');
      expect(parsedBody.messages[0].content).toBe('You are a helpful assistant');
      expect(parsedBody.messages[1].role).toBe('user');
      expect(parsedBody.messages[1].content).toBe('Hello LLM');
      expect(parsedBody.max_tokens).toBe(256);
      expect(parsedBody.temperature).toBe(0.7);
      expect(parsedBody.response_format).toEqual({ type: 'json_object' });
    });

    it('uses default values when maxTokens/temperature not provided', async () => {
      mockedHttpRequest.mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: JSON.stringify({
          choices: [{ message: { content: '{}' } }],
        }),
      } as HttpResponse);

      await openaiClient.generateCompletion({ prompt: 'test' });

      const callArgs = mockedHttpRequest.mock.calls[0] as [
        string,
        { body?: string }
      ];
      const parsedBody = JSON.parse(callArgs[1].body as string);
      expect(parsedBody.max_tokens).toBe(1024);
      expect(parsedBody.temperature).toBe(0.3);
    });
  });

  describe('C. createLLMClient factory', () => {
    it('mock provider returns a MockLLMClient instance', async () => {
      process.env.LLM_PROVIDER = 'mock';

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(MockLLMClient);
    });

    it('mock provider client can generate completions', async () => {
      process.env.LLM_PROVIDER = 'mock';

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      const response = await client!.generateCompletion({ prompt: 'test' });
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
    });

    it('openai provider with valid config returns an OpenAIClient', async () => {
      process.env.LLM_PROVIDER = 'openai';
      mockedGetIntegrationConfig.mockResolvedValue('sk-openai-key-from-config');

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeInstanceOf(OpenAIClient);
      expect(mockedGetIntegrationConfig).toHaveBeenCalledWith({
        organizationId: '00000000-0000-0000-0000-000000000001',
        provider: 'openai',
        configKey: 'api_key',
      });
    });

    it('openai provider with missing config returns undefined (NotFound)', async () => {
      process.env.LLM_PROVIDER = 'openai';
      mockedGetIntegrationConfig.mockRejectedValue(
        new NotFoundError(
          "Integration config not found for provider 'openai' key 'api_key'"
        )
      );

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeUndefined();
      expect(mockedGetIntegrationConfig).toHaveBeenCalledTimes(1);
    });

    it('openai provider with other error returns undefined', async () => {
      process.env.LLM_PROVIDER = 'openai';
      mockedGetIntegrationConfig.mockRejectedValue(new Error('Database error'));

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeUndefined();
      expect(mockedGetIntegrationConfig).toHaveBeenCalledTimes(1);
    });

    it('unknown provider returns undefined', async () => {
      process.env.LLM_PROVIDER = 'unknown';

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeUndefined();
      expect(mockedGetIntegrationConfig).not.toHaveBeenCalled();
    });

    it('default (no LLM_PROVIDER env) returns mock client', async () => {
      delete process.env.LLM_PROVIDER;

      const client = await createLLMClient(
        '00000000-0000-0000-0000-000000000001'
      );

      expect(client).toBeInstanceOf(MockLLMClient);
    });
  });
});
