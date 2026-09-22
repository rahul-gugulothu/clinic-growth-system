import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  setIntegrationConfig,
  getIntegrationConfigStatus,
  deleteIntegrationConfig,
  getIntegrationHealth,
  ApiError,
} from '@/api/client';
import type { IntegrationHealthResponse } from '@/features/internal/ai/types/api';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    setIntegrationConfig: vi.fn(),
    getIntegrationConfigStatus: vi.fn(),
    deleteIntegrationConfig: vi.fn(),
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
  all_healthy: false,
  integrations: {
    sendgrid: {
      configured: false,
      missing_keys: ['api_key', 'from_email'],
      healthy: null,
      checked_at: null,
    },
  },
};

const mockMissingStatus = { provider: 'sendgrid', config_key: 'api_key', configured: false };

describe('IntegrationConfigPage', () => {
  let IntegrationConfigPage: typeof import('@/features/internal/integrations/IntegrationConfigPage').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    (getIntegrationConfigStatus as Mock).mockResolvedValue(mockMissingStatus);
    (getIntegrationHealth as Mock).mockResolvedValue(mockHealth);
    const mod = await import('@/features/internal/integrations/IntegrationConfigPage');
    IntegrationConfigPage = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderPage = () => {
    render(
      <MemoryRouter>
        <IntegrationConfigPage />
      </MemoryRouter>
    );
  };

  it('renders "Not configured" state for all fields initially', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    expect(screen.getByText('API Key').parentElement).toBeInTheDocument();
    expect(screen.getByText('SendGrid Credentials')).toBeInTheDocument();
    expect(screen.queryByText('Configured')).toBeNull();
  });

  it('renders "Configured" state for keys that exist', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    renderPage();

    await waitFor(() => {
      const configuredBadges = screen.getAllByText('Configured');
      expect(configuredBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders API key input as password type', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');
  });

  it('does NOT pre-populate API key field from status API', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');
  });

  it('does NOT pre-populate from_email or from_name fields', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText('From Email') as HTMLInputElement;
    const nameInput = screen.getByLabelText('From Name') as HTMLInputElement;
    expect(emailInput.value).toBe('');
    expect(nameInput.value).toBe('');
  });

  it('shows validation error when required fields are missing', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByText(/API Key is required/)).toBeInTheDocument();
    });
  });

  it('saves configuration on valid submit', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    (setIntegrationConfig as Mock).mockResolvedValue({
      provider: 'sendgrid',
      config_key: 'from_email',
      configured: true,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'SG.test_key_123' } });
    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'hello@example.com' } });
    fireEvent.change(screen.getByLabelText('From Name'), { target: { value: 'Clinic Growth' } });

    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(setIntegrationConfig).toHaveBeenCalledWith({
        provider: 'sendgrid',
        configKey: 'api_key',
        value: 'SG.test_key_123',
      });
      expect(setIntegrationConfig).toHaveBeenCalledWith({
        provider: 'sendgrid',
        configKey: 'from_email',
        value: 'hello@example.com',
      });
      expect(setIntegrationConfig).toHaveBeenCalledWith({
        provider: 'sendgrid',
        configKey: 'from_name',
        value: 'Clinic Growth',
      });
    });
  });

  it('clears API key field after successful save', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    (setIntegrationConfig as Mock).mockResolvedValue({ provider: 'sendgrid', config_key: 'from_email', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'SG.test_key_123' } });
    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'hello@example.com' } });

    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(setIntegrationConfig).toHaveBeenCalled();
    });

    expect(apiKeyInput.value).toBe('');
  });

  it('shows success message after save', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    (setIntegrationConfig as Mock).mockResolvedValue({ provider: 'sendgrid', config_key: 'from_email', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'hello@example.com' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'SG.test_key_123' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(await screen.findByText(/Configuration saved/)).toBeInTheDocument();
  });

  it('shows error message on save failure', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    (setIntegrationConfig as Mock).mockRejectedValue(new ApiError('Invalid API key', 400));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'hello@example.com' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'SG.test_key_123' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(await screen.findByText('Invalid API key')).toBeInTheDocument();
  });

  it('does not save API key when already configured and field is empty', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    (setIntegrationConfig as Mock).mockResolvedValue({ provider: 'sendgrid', config_key: 'from_email', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(setIntegrationConfig).toHaveBeenCalledWith({
        provider: 'sendgrid',
        configKey: 'from_email',
        value: 'new@example.com',
      });
      expect(setIntegrationConfig).not.toHaveBeenCalledWith({
        provider: 'sendgrid',
        configKey: 'api_key',
        value: expect.anything(),
      });
    });
  });

  it('shows delete confirmation dialog when Delete All clicked', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete All'));

    expect(screen.getByText('Delete Configuration?')).toBeInTheDocument();
  });

  it('calls deleteIntegrationConfig for each configured key on confirm', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    (deleteIntegrationConfig as Mock).mockResolvedValue({ provider: 'sendgrid', config_key: 'api_key', deleted: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete All'));

    const confirmButton = screen.getByText('Delete Configuration');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteIntegrationConfig).toHaveBeenCalledWith({ provider: 'sendgrid', configKey: 'api_key' });
      expect(deleteIntegrationConfig).toHaveBeenCalledWith({ provider: 'sendgrid', configKey: 'from_email' });
      expect(deleteIntegrationConfig).toHaveBeenCalledWith({ provider: 'sendgrid', configKey: 'from_name' });
    });
  });

  it('cancels delete when Cancel button clicked', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    (deleteIntegrationConfig as Mock).mockResolvedValue({ provider: 'sendgrid', config_key: 'api_key', deleted: true });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete All'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(deleteIntegrationConfig).not.toHaveBeenCalled();
  });

  it('shows error on delete failure', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: true })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: true });

    (deleteIntegrationConfig as Mock).mockRejectedValue(new ApiError('Database error', 500));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete All'));
    fireEvent.click(screen.getByText('Delete Configuration'));

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument();
    });
  });

  it('navigates back to health page when Back to Health clicked', async () => {
    (getIntegrationConfigStatus as Mock).mockResolvedValue(mockMissingStatus);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back to Health'));

    const backButton = screen.getByText('Back to Health');
    expect(backButton).toBeInTheDocument();
  });

  it('prevents double submission while saving', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    (setIntegrationConfig as Mock).mockImplementation(() => new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('From Email'), { target: { value: 'hello@example.com' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'SG.test_key_123' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    const saveButton = await screen.findByText('Saving...');
    expect(saveButton.closest('button')).toBeDisabled();
  });

  it('disables Delete All when no config exists', async () => {
    (getIntegrationConfigStatus as Mock)
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'api_key', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_email', configured: false })
      .mockResolvedValueOnce({ provider: 'sendgrid', config_key: 'from_name', configured: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Integration Configuration')).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete All').closest('button');
    expect(deleteButton).toBeDisabled();
  });
});
