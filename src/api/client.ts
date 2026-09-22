import type {
  LoginResponse,
  AiExecutionsListResponse,
  AiExecutionDetailResponse,
  ApproveExecutionResponse,
  RejectExecutionResponse,
  AiExecution,
  AiExecutionWithDeliveryStatus,
  AiExecutionWithIntegration,
  AiToolDefinition,
   AiToolExecutionResult,
   IntegrationHealthResponse,
   Pagination,
} from '../features/internal/ai/types/api';

const BASE_URL =
  (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined) ||
  'http://localhost:3001/api/v1';

export const AUTH_TOKEN_KEY = 'cgs_access_token';
export const AUTH_USER_KEY = 'cgs_user';

export interface StoredUser {
  email: string;
  role: string;
  organizationId: string;
  userId: string;
  clinicId: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser | null): void {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function decodeJwt(token: string): { role: string; userId: string; organizationId: string; clinicId: string | null } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    let decoded: string;
    try {
      decoded = atob(payload);
    } catch {
      if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(payload, 'base64').toString('utf-8');
      } else {
        return null;
      }
    }
    const data = JSON.parse(decoded) as Record<string, unknown>;
    return {
      role: String(data.role ?? ''),
      userId: String(data.sub ?? ''),
      organizationId: String(data.org_id ?? ''),
      clinicId: data.clinic_id ? String(data.clinic_id) : null,
    };
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const UNAUTH_EVENT = 'cgs:auth:unauthorized';

function getHeaders(init?: RequestInit): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (init?.headers) {
    const existing = new Headers(init.headers);
    existing.forEach((value, key) => {
      headers[key] = value;
    });
  }
  return headers;
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error?.message) return data.error.message;
    if (typeof data?.message === 'string') return data.message;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: getHeaders(options),
    credentials: 'include',
  });

  if (res.status === 401) {
    clearAuth();
    window.dispatchEvent(new CustomEvent(UNAUTH_EVENT));
  }

  return res;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const msg = await extractErrorMessage(res);
    throw new ApiError(msg, res.status);
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return undefined as unknown as T;
}

export async function login(email: string): Promise<{ access_token: string; user: StoredUser }> {
  const data = await request<LoginResponse>('auth/dev/login', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

  const decoded = decodeJwt(data.access_token);
  if (!decoded) {
    throw new Error('Failed to decode access token');
  }

  const user: StoredUser = {
    email,
    role: decoded.role,
    organizationId: decoded.organizationId,
    userId: decoded.userId,
    clinicId: decoded.clinicId,
  };

  setToken(data.access_token);
  setStoredUser(user);

  return { access_token: data.access_token, user };
}

export interface ListExecutionsParams {
  tool_id?: string;
  limit?: number;
  offset?: number;
}

export async function listAIExecutions(
  params: ListExecutionsParams = {}
): Promise<{ executions: AiExecutionWithDeliveryStatus[]; pagination: Pagination }> {
  const search = new URLSearchParams();
  if (params.tool_id) search.set('tool_id', params.tool_id);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  const query = search.toString();
  const path = query ? `ai/executions?${query}` : 'ai/executions';

  const data = await request<AiExecutionsListResponse>(path);
  return data;
}

export async function getAIExecution(id: string): Promise<AiExecutionWithIntegration> {
  const data = await request<AiExecutionDetailResponse>(`ai/${id}`);
  return data.execution;
}

export async function approveAIExecution(id: string): Promise<AiExecution> {
  const data = await request<ApproveExecutionResponse>(`ai/${id}/approve`, {
    method: 'POST',
  });
  return data.execution;
}

export async function rejectAIExecution(id: string, reason: string): Promise<AiExecution> {
  const data = await request<RejectExecutionResponse>(`ai/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return data.execution;
}

export async function executeAITool(
  toolId: string,
  context: Record<string, unknown> = {}
): Promise<AiToolExecutionResult> {
  const data = await request<{ execution: AiToolExecutionResult }>(
    `ai/tools/${toolId}`,
    {
      method: 'POST',
      body: JSON.stringify({ context }),
    }
  );
  return data.execution;
}

export async function listAITools(): Promise<AiToolDefinition[]> {
  const data = await request<{ tools: AiToolDefinition[] }>('ai/tools');
  return data.tools;
}

export async function getIntegrationHealth(): Promise<IntegrationHealthResponse> {
  return request<IntegrationHealthResponse>('integrations/health');
}

export { UNAUTH_EVENT };
