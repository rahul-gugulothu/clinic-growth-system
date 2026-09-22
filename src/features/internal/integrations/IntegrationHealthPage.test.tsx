import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getIntegrationHealth, ApiError } from '@/api/client';
import type { IntegrationHealthResponse } from '@/features/internal/ai/types/api';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    getIntegrationHealth: vi.fn(),
  };
});

vi.mock('@/store', () => ({
  useStore: vi.fn(() => ({
    session: { email: 'founder@test.com', currentRole: 'founder', currentWorkspace: 'internal', activeClinicId: null },
    logout: vi.fn(),
  })),
  selectAllProspects: vi.fn(),
  selectAllOutreach: vi.fn(),
  selectAllProposals: vi.fn(),
  selectClinics: vi.fn(),
}));

const mockHealth: IntegrationHealthResponse = {
  status: 'ok',
  all_healthy: true,
  integrations: {
    sendgrid: {
      configured: true,
      missing_keys: [],
      healthy: true,
      checked_at: '2024-01-01T10:00:00Z',
    },
  },
};

describe('IntegrationHealthPage', () => {
  let IntegrationHealthPage: typeof import('@/features/internal/integrations/IntegrationHealthPage').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    (getIntegrationHealth as Mock).mockResolvedValue(mockHealth);
    const mod = await import('@/features/internal/integrations/IntegrationHealthPage');
    IntegrationHealthPage = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderPage = () => {
    render(<IntegrationHealthPage />);
  };

  it('renders provider name and healthy status', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('SendGrid')).toBeInTheDocument();
    });
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('All healthy')).toBeInTheDocument();
  });

  it('renders configured provider as healthy', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('All required keys configured')).toBeInTheDocument();
    });
  });

  it('renders unhealthy status when healthCheck fails', async () => {
    const unhealthyHealth: IntegrationHealthResponse = {
      ...mockHealth,
      all_healthy: false,
      integrations: {
        sendgrid: {
          configured: true,
          missing_keys: [],
          healthy: false,
          checked_at: '2024-01-01T10:00:00Z',
        },
      },
    };
    (getIntegrationHealth as Mock).mockResolvedValue(unhealthyHealth);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    });
    expect(screen.getByText('Issues found')).toBeInTheDocument();
  });

  it('renders not configured status when keys are missing', async () => {
    const notConfiguredHealth: IntegrationHealthResponse = {
      ...mockHealth,
      all_healthy: true,
      integrations: {
        sendgrid: {
          configured: false,
          missing_keys: ['api_key', 'from_email'],
          healthy: false,
          checked_at: null,
        },
      },
    };
    (getIntegrationHealth as Mock).mockResolvedValue(notConfiguredHealth);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
    expect(screen.getByText('Missing: api_key, from_email')).toBeInTheDocument();
  });

  it('renders "No health check" for providers without healthCheck', async () => {
    const unsupportedHealth: IntegrationHealthResponse = {
      ...mockHealth,
      all_healthy: true,
      integrations: {
        sendgrid: {
          configured: true,
          missing_keys: [],
          healthy: null,
          checked_at: null,
        },
      },
    };
    (getIntegrationHealth as Mock).mockResolvedValue(unsupportedHealth);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No health check')).toBeInTheDocument();
    });
  });

  it('renders loading state initially', async () => {
    (getIntegrationHealth as Mock).mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    (getIntegrationHealth as Mock).mockRejectedValue(new ApiError('Unauthorized', 401));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  it('refreshes health on Check health button click', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('SendGrid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Check health'));

    await waitFor(() => {
      expect(getIntegrationHealth).toHaveBeenCalledTimes(2);
    });
  });

  it('does not display config values or secrets', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('SendGrid')).toBeInTheDocument();
    });

    const serialized = document.body.textContent ?? '';
    expect(serialized).not.toContain('config_value_encrypted');
    expect(serialized).not.toContain('SENDGRID_API_KEY_SECRET');
  });
});
