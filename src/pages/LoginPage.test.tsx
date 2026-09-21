import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsIm9yZ19pZCI6Im9yZy0xIiwicm9sZSI6ImZvdW5kZXIiLCJjbGluaWNfaWQiOm51bGwsInRva2VuX3R5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.signature';

describe('LoginPage', () => {
  let LoginPage: typeof import('@/pages/LoginPage').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('fetch', mockFetch);
    const mod = await import('@/pages/LoginPage');
    LoginPage = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const renderPage = () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );
  };

  it('renders email input and submit button', () => {
    renderPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('successful backend login stores JWT in localStorage', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      headers: { get: () => 'application/json' },
    });

    renderPage();

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'founder@cliniciogrowth.local' } });

    const submitButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(localStorage.getItem('cgs_access_token')).toBe(mockToken);
    });

    const storedUser = localStorage.getItem('cgs_user');
    expect(storedUser).not.toBeNull();
    expect(JSON.parse(storedUser!).email).toBe('founder@cliniciogrowth.local');
    expect(JSON.parse(storedUser!).role).toBe('founder');
  });

  it('does not generate fake/mock tokens', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      headers: { get: () => 'application/json' },
    });

    renderPage();

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'founder@cliniciogrowth.local' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      const token = localStorage.getItem('cgs_access_token');
      expect(token).toBe(mockToken);
    });
  });

  it('failed login shows error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'Invalid credentials', status: 400 } }),
      headers: { get: () => 'application/json' },
    });

    renderPage();

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'nonexistent@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });

    expect(localStorage.getItem('cgs_access_token')).toBeNull();
    expect(localStorage.getItem('cgs_user')).toBeNull();
  });

  it('sends email to the backend dev login endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      headers: { get: () => 'application/json' },
    });

    renderPage();

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'founder@cliniciogrowth.local' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('/api/v1/auth/dev/login');
    const body = JSON.parse(call[1].body as string);
    expect(body.email).toBe('founder@cliniciogrowth.local');
  });

  it('shows loading state during login', async () => {
    let resolveLogin: (value: unknown) => void;
    mockFetch.mockReturnValue(new Promise((resolve) => {
      resolveLogin = resolve;
    }));

    renderPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'founder@cliniciogrowth.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    resolveLogin!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: mockToken, token_type: 'Bearer', expires_in: 900 }),
      headers: { get: () => 'application/json' },
    });
  });
});
