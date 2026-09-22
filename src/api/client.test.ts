import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsIm9yZ19pZCI6Im9yZy0xIiwicm9sZSI6ImZvdW5kZXIiLCJjbGluaWNfaWQiOm51bGwsInRva2VuX3R5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.signature';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: {
      get: () => 'application/json',
    },
  };
}

describe('API Client', () => {
  let client: typeof import('@/api/client');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);
    localStorage.clear();
    client = await import('@/api/client');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('Authorization header', () => {
    it('sets Bearer token when token exists in localStorage', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ ok: true }));

      await client.request('auth/dev/login');

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('does not set Authorization header when no token exists', async () => {
      mockFetch.mockResolvedValue(mockResponse({ ok: true }));

      await client.request('auth/dev/login');

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('JSON parsing', () => {
    it('parses JSON response body', async () => {
      const responseBody = { executions: [], pagination: { page: 1, limit: 20, total: 0, hasMore: false } };
      mockFetch.mockResolvedValue(mockResponse(responseBody));

      const result = await client.request('ai/executions');
      expect(result).toEqual(responseBody);
    });

    it('throws ApiError with message from error response body', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ error: { message: 'Execution not found', status: 404 } }, 404),
      );

      await expect(client.request('ai/nonexistent')).rejects.toThrow('Execution not found');
      const error = (await client.request('ai/nonexistent').catch((e) => e)) as { status: number };
      expect(error.status).toBe(404);
    });
  });

  describe('401 handling', () => {
    it('clears stored auth state on 401', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      localStorage.setItem('cgs_user', JSON.stringify({ email: 'test@test.com', role: 'founder', organizationId: 'org-1', userId: 'user-1', clinicId: null }));
      mockFetch.mockResolvedValue(mockResponse({ error: { message: 'Unauthorized', status: 401 } }, 401));

      await expect(client.request('ai/executions')).rejects.toThrow('Unauthorized');

      expect(localStorage.getItem('cgs_access_token')).toBeNull();
      expect(localStorage.getItem('cgs_user')).toBeNull();
    });

    it('dispatches unauthorized event on 401', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: { message: 'Unauthorized', status: 401 } }, 401));

      const handler = vi.fn();
      window.addEventListener('cgs:auth:unauthorized', handler);

      await expect(client.request('ai/executions')).rejects.toThrow();

      expect(handler).toHaveBeenCalledTimes(1);
      window.removeEventListener('cgs:auth:unauthorized', handler);
    });
  });

  describe('login', () => {
    it('stores JWT and user info on successful login', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      );

      const result = await client.login('founder@cliniciogrowth.local');

      expect(result.access_token).toBe(mockToken);
      expect(localStorage.getItem('cgs_access_token')).toBe(mockToken);
      const storedUser = localStorage.getItem('cgs_user');
      expect(storedUser).not.toBeNull();
      const user = JSON.parse(storedUser!);
      expect(user.email).toBe('founder@cliniciogrowth.local');
      expect(user.role).toBe('founder');
      expect(user.organizationId).toBe('org-1');
    });

    it('does not generate fake tokens on login failure', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ error: { message: 'Invalid credentials', status: 401 } }, 401),
      );

      await expect(client.login('bad@email.com')).rejects.toThrow('Invalid credentials');

      expect(localStorage.getItem('cgs_access_token')).toBeNull();
      expect(localStorage.getItem('cgs_user')).toBeNull();
    });

    it('sends email in request body', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      );

      await client.login('founder@cliniciogrowth.local');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      expect(body.email).toBe('founder@cliniciogrowth.local');
    });
  });

  describe('decodeJwt', () => {
    it('decodes JWT payload', () => {
      const decoded = client.decodeJwt(mockToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.role).toBe('founder');
      expect(decoded!.userId).toBe('user-123');
      expect(decoded!.organizationId).toBe('org-1');
      expect(decoded!.clinicId).toBeNull();
    });

    it('returns null for invalid token', () => {
      const decoded = client.decodeJwt('not-a-jwt');
      expect(decoded).toBeNull();
    });
  });

  describe('executeAITool', () => {
    const mockExecution = {
      id: 'exec-1',
      organization_id: 'org-1',
      tool_id: 'priority-clinics',
      status: 'completed' as const,
      data: { clinics: [] },
      requires_human_review: false,
      duration_ms: 100,
      created_at: '2024-01-01T10:00:00Z',
      completed_at: '2024-01-01T10:00:01Z',
      approved_by: null,
      approved_at: null,
    };

    it('sends POST with context body', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ execution: mockExecution }));

      const result = await client.executeAITool('priority-clinics', { prospectId: 'abc-123' });

      expect(result).toEqual(mockExecution);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('ai/tools/priority-clinics');
      expect(call[1].method).toBe('POST');
      const body = JSON.parse(call[1].body as string);
      expect(body.context).toEqual({ prospectId: 'abc-123' });
    });

    it('defaults context to empty object', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ execution: mockExecution }));

      await client.executeAITool('priority-clinics');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      expect(body.context).toEqual({});
    });

    it('includes Bearer token', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ execution: mockExecution }));

      await client.executeAITool('priority-clinics');

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    it('throws ApiError on 400', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(
        mockResponse({ error: { message: 'Invalid context' } }, 400),
      );

      await expect(client.executeAITool('prospect-summary', {})).rejects.toThrow('Invalid context');
    });

    it('returns execution for requires_approval tools', async () => {
      const approvalExec = { ...mockExecution, tool_id: 'draft-email', status: 'requires_approval' as const, requires_human_review: true };
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ execution: approvalExec }));

      const result = await client.executeAITool('draft-email', { prospectId: 'abc-123' });

      expect(result.status).toBe('requires_approval');
      expect(result.requires_human_review).toBe(true);
    });
  });

  describe('listAITools', () => {
    const mockTools = [
      { id: 'priority-clinics', name: 'Priority Clinics', description: 'Get top prospects', tenant_scope: 'org' as const, required_context: [], human_review_required: false },
      { id: 'draft-email', name: 'Draft Email', description: 'Generate email', tenant_scope: 'org' as const, required_context: ['prospectId'], human_review_required: true },
    ];

    it('returns tools array', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ tools: mockTools }));

      const result = await client.listAITools();

      expect(result).toEqual(mockTools);
      expect(result).toHaveLength(2);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('ai/tools');
    });

    it('includes Bearer token', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse({ tools: mockTools }));

      await client.listAITools();

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });
  });

  describe('getIntegrationHealth', () => {
    const mockHealth = {
      status: 'ok',
      integrations: {
        sendgrid: {
          configured: true,
          missing_keys: [],
          healthy: true,
          checked_at: '2024-01-01T10:00:00Z',
        },
      },
      all_healthy: true,
    };

    it('returns health response', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse(mockHealth));

      const result = await client.getIntegrationHealth();

      expect(result).toEqual(mockHealth);
      expect(mockFetch.mock.calls[0][0]).toContain('integrations/health');
    });

    it('includes Bearer token', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(mockResponse(mockHealth));

      await client.getIntegrationHealth();

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    it('throws ApiError on 401', async () => {
      localStorage.setItem('cgs_access_token', mockToken);
      mockFetch.mockResolvedValue(
        mockResponse({ error: { message: 'Unauthorized', status: 401 } }, 401),
      );

      await expect(client.getIntegrationHealth()).rejects.toThrow('Unauthorized');
    });
  });
});
