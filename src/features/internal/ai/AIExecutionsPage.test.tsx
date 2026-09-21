import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  listAIExecutions,
  getAIExecution,
  approveAIExecution,
  rejectAIExecution,
  ApiError,
} from '@/api/client';
import type {
  AiExecutionWithDeliveryStatus,
  AiExecutionWithIntegration,
  IntegrationDeliveryEvent,
} from '@/features/internal/ai/types/api';

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/client')>();
  return {
    ...actual,
    listAIExecutions: vi.fn(),
    getAIExecution: vi.fn(),
    approveAIExecution: vi.fn(),
    rejectAIExecution: vi.fn(),
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

const MOCK_EXECUTION: AiExecutionWithDeliveryStatus & { integration_events?: never } = {
  id: 'exec-1',
  organization_id: 'org-1',
  clinic_id: null,
  user_id: 'user-1',
  tool_id: 'draft-email',
  context: {},
  status: 'requires_approval' as const,
  started_at: '2024-01-01T10:00:00Z',
  completed_at: '2024-01-01T10:01:00Z',
  duration_ms: 60000,
  result_id: null,
  result_output: {
    to: 'dr.kaya@example.com',
    subject: 'Partnership inquiry',
    body: 'Hi Dr. Kaya...',
    body_type: 'text',
  },
  requires_human_review: true,
  approved_by: null,
  approved_at: null,
  success: true,
  error: null,
  created_at: '2024-01-01T10:00:00Z',
  latest_integration_status: 'pending' as const,
  has_integration_events: true,
};

const MOCK_EXECUTION_2: AiExecutionWithDeliveryStatus & { integration_events?: never } = {
  id: 'exec-2',
  organization_id: 'org-1',
  clinic_id: null,
  user_id: 'user-1',
  tool_id: 'priority-clinics',
  context: {},
  status: 'completed' as const,
  started_at: '2024-01-01T09:00:00Z',
  completed_at: '2024-01-01T09:00:05Z',
  duration_ms: 5000,
  result_id: null,
  result_output: { clinics: [] },
  requires_human_review: false,
  approved_by: null,
  approved_at: null,
  success: true,
  error: null,
  created_at: '2024-01-01T09:00:00Z',
  latest_integration_status: null,
  has_integration_events: false,
};

const MOCK_INTEGRATION_EVENT: IntegrationDeliveryEvent = {
  provider: 'sendgrid',
  event_type: 'email.send',
  status: 'pending',
  retry_count: 0,
  error_message: null,
  next_retry_at: null,
  sent_at: null,
};

const MOCK_DETAIL: AiExecutionWithIntegration = {
  ...MOCK_EXECUTION,
  integration_events: [MOCK_INTEGRATION_EVENT],
};

describe('AIExecutionsPage', () => {
  let AIExecutionsPage: typeof import('@/features/internal/ai/AIExecutionsPage').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    (listAIExecutions as Mock).mockResolvedValue({
      executions: [MOCK_EXECUTION, MOCK_EXECUTION_2],
      pagination: { page: 1, limit: 20, total: 2, hasMore: false },
    });
    (getAIExecution as Mock).mockResolvedValue(MOCK_DETAIL);
    const mod = await import('@/features/internal/ai/AIExecutionsPage');
    AIExecutionsPage = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderPage = () => {
    render(
      <MemoryRouter initialEntries={['/internal/ai/executions']}>
        <AIExecutionsPage />
      </MemoryRouter>,
    );
  };

  // 1
  it('renders execution list', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('draft-email')).toBeInTheDocument();
    });
    expect(screen.getByText('priority-clinics')).toBeInTheDocument();
    expect(screen.getByText('Executions (2)')).toBeInTheDocument();
  });

  // 2
  it('renders delivery status for executions with integration events', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
    expect(screen.getByText('No events')).toBeInTheDocument();
  });

  // 3
  it('loads and displays execution detail', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('draft-email')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Result Output')).toBeInTheDocument();
    });
    expect(screen.getByText('Requires Human Review')).toBeInTheDocument();
  });

  // 4
  it('renders integration event timeline', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Integration Events')).toBeInTheDocument();
    });
    const timeline = screen.getByText('Integration Events');
    const timelineSection = timeline.closest('div')?.parentElement;
    expect(timelineSection).not.toBeNull();
    expect(screen.getByText('sendgrid')).toBeInTheDocument();
    expect(screen.getByText('email.send')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // 5
  it('renders safely when no integration events exist', async () => {
    (getAIExecution as Mock).mockResolvedValue({
      ...MOCK_DETAIL,
      integration_events: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No integration events for this execution.')).toBeInTheDocument();
    });
  });

  // 6
  it('approve button calls correct API', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(approveAIExecution).toHaveBeenCalledWith('exec-1');
    });
  });

  // 7
  it('reject button calls correct API with reason', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole('button', { name: /reject/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const reasonInput = within(dialog).getByPlaceholderText(/explain why/i);
    fireEvent.change(reasonInput, { target: { value: 'Client not interested' } });

    const confirmRejectBtn = within(dialog).getByRole('button', { name: /reject/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(rejectAIExecution).toHaveBeenCalledWith('exec-1', 'Client not interested');
    });
  });

  // 8
   it('post-action refresh updates UI', async () => {
    const approvedExecution = {
      ...MOCK_EXECUTION,
      status: 'approved' as const,
      approved_by: 'user-1',
      approved_at: '2024-01-01T11:00:00Z',
    };
    (approveAIExecution as Mock).mockResolvedValue(approvedExecution);
    (getAIExecution as Mock)
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValue({ ...MOCK_DETAIL, status: 'approved' as const, approved_by: 'user-1', approved_at: '2024-01-01T11:00:00Z' });
    (listAIExecutions as Mock)
      .mockResolvedValueOnce({
        executions: [MOCK_EXECUTION, MOCK_EXECUTION_2],
        pagination: { page: 1, limit: 20, total: 2, hasMore: false },
      })
      .mockResolvedValue({
        executions: [approvedExecution, MOCK_EXECUTION_2],
        pagination: { page: 1, limit: 20, total: 2, hasMore: false },
      });

    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Requires Approval')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(approveAIExecution).toHaveBeenCalledWith('exec-1');
    });

    await waitFor(() => {
      expect(screen.queryAllByText('Requires Approval')).toHaveLength(0);
    });

    expect(getAIExecution).toHaveBeenCalledTimes(2);
    expect(listAIExecutions).toHaveBeenCalledTimes(2);
  });

  // 9
  it('renders useful error state on API failure', async () => {
    (listAIExecutions as Mock).mockRejectedValue(
      new ApiError('Internal Server Error', 500),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Internal Server Error/i)).toBeInTheDocument();
    });
  });

  // 10
  it('401 path clears auth state and redirects to login', async () => {
    (listAIExecutions as Mock).mockRejectedValue(
      new ApiError('Unauthorized', 401),
    );

    renderPage();

    await waitFor(() => {
      expect(listAIExecutions).toHaveBeenCalled();
    });

    expect(screen.queryByText(/Unauthorized/i)).not.toBeInTheDocument();
    const token = localStorage.getItem('cgs_access_token');
    const user = localStorage.getItem('cgs_user');
    expect(token).toBeNull();
    expect(user).toBeNull();
  });
});
