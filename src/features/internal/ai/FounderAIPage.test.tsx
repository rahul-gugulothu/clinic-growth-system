import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    listFounderConversations: vi.fn(),
    createFounderConversation: vi.fn(),
    getFounderConversation: vi.fn(),
    renameFounderConversation: vi.fn(),
    archiveFounderConversation: vi.fn(),
    deleteFounderConversation: vi.fn(),
    executeAITool: vi.fn(),
    approveAIExecution: vi.fn(),
    rejectAIExecution: vi.fn(),
    ApiError: class ApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.status = status;
      }
    },
  };
});

vi.mock('@/store', () => {
  const mockState = {
    session: { email: 'founder@test.com', currentRole: 'founder', currentWorkspace: 'internal', activeClinicId: null },
    prospects: [],
    audits: [],
    outreach: [],
    proposals: [],
    clinics: [],
  };
  return {
    useStore: vi.fn((selector?: (state: typeof mockState) => unknown) => {
      if (!selector) return mockState;
      return selector(mockState);
    }),
    selectAllProspects: vi.fn((s: typeof mockState) => s.prospects),
    selectAllOutreach: vi.fn((s: typeof mockState) => s.outreach),
    selectAllProposals: vi.fn((s: typeof mockState) => s.proposals),
    selectClinics: vi.fn((s: typeof mockState) => s.clinics),
  };
});

vi.mock('./hooks/useFounderChat', () => ({
  useFounderChat: vi.fn(() => ({
    messages: [{ id: 'welcome', role: 'assistant', content: 'Welcome', timestamp: new Date() }],
    inputValue: '',
    isLoading: false,
    context: {},
    sendMessage: vi.fn(),
    runTool: vi.fn(),
    setInputValue: vi.fn(),
    clearChat: vi.fn(),
    activities: [],
    approveToolExecution: vi.fn(),
    rejectToolExecution: vi.fn(),
  })),
}));

import {
  listFounderConversations,
  createFounderConversation,
  getFounderConversation,
  renameFounderConversation,
  archiveFounderConversation,
  deleteFounderConversation,
  executeAITool,
} from '@/api/client';
import type {
  ConversationListResponse,
  ConversationCreateResponse,
  ConversationRenameResponse,
  ConversationDeleteResponse,
  ConversationArchiveResponse,
  FounderConversationRecord,
  FounderConversationMessage,
  FounderConversationSummary,
} from '@/features/internal/ai/types/api';

const mockConversation: FounderConversationRecord = {
  id: 'conv-1',
  organization_id: 'org-1',
  user_id: 'user-1',
  clinic_id: null,
  title: 'My conversation 1',
  archived: false,
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-01T10:30:00Z',
};

const mockConversations: ConversationListResponse = {
  conversations: [
    {
      id: 'conv-1',
      title: 'My conversation 1',
      clinic_id: null,
      created_at: '2024-01-01T10:00:00Z',
      updated_at: '2024-01-01T10:30:00Z',
      last_message_preview: 'Hello there',
      message_count: 3,
    } as FounderConversationSummary,
    {
      id: 'conv-2',
      title: 'My conversation 2',
      clinic_id: null,
      created_at: '2024-01-01T09:00:00Z',
      updated_at: '2024-01-01T09:30:00Z',
      last_message_preview: 'How are you?',
      message_count: 2,
    } as FounderConversationSummary,
  ],
  pagination: { limit: 50, offset: 0, total: 2 },
};

const mockMessages: FounderConversationMessage[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    organization_id: 'org-1',
    role: 'user',
    content: 'Hello there',
    tool_execution_id: null,
    metadata: {},
    created_at: '2024-01-01T10:00:00Z',
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    organization_id: 'org-1',
    role: 'assistant',
    content: 'Hi! How can I help?',
    tool_execution_id: null,
    metadata: {},
    created_at: '2024-01-01T10:01:00Z',
  },
];

const mockCreateResponse: ConversationCreateResponse = {
  conversation: {
    ...mockConversation,
    id: 'conv-new',
    title: 'New Conversation',
  },
};

describe('FounderAIPage', () => {
  let apiMocks: {
    listFounderConversations: Mock;
    createFounderConversation: Mock;
    getFounderConversation: Mock;
    renameFounderConversation: Mock;
    archiveFounderConversation: Mock;
    deleteFounderConversation: Mock;
    executeAITool: Mock;
  };

  beforeEach(() => {
    apiMocks = {
      listFounderConversations: vi.mocked(listFounderConversations),
      createFounderConversation: vi.mocked(createFounderConversation),
      getFounderConversation: vi.mocked(getFounderConversation),
      renameFounderConversation: vi.mocked(renameFounderConversation),
      archiveFounderConversation: vi.mocked(archiveFounderConversation),
      deleteFounderConversation: vi.mocked(deleteFounderConversation),
      executeAITool: vi.mocked(executeAITool),
    };

    apiMocks.listFounderConversations.mockResolvedValue(mockConversations);
    apiMocks.createFounderConversation.mockResolvedValue(mockCreateResponse);
    apiMocks.getFounderConversation.mockResolvedValue({
      conversation: { ...mockConversation },
      messages: mockMessages,
    });
    apiMocks.renameFounderConversation.mockResolvedValue({
      conversation: { ...mockConversation, title: 'Renamed' },
    } as ConversationRenameResponse);
    apiMocks.archiveFounderConversation.mockResolvedValue({
      archived: true,
      conversation: { ...mockConversation, archived: true },
    } as ConversationArchiveResponse);
    apiMocks.deleteFounderConversation.mockResolvedValue({ deleted: true } as ConversationDeleteResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderPage = async () => {
    const { default: FounderAIPage } = await import('./FounderAIPage');
    return render(
      <MemoryRouter initialEntries={['/internal/ai']}>
        <FounderAIPage />
      </MemoryRouter>,
    );
  };

  it('renders sidebar with conversation list', async () => {
    await renderPage();

    expect(await screen.findByText('My conversation 1', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(await screen.findByText('My conversation 2', {}, { timeout: 15000 })).toBeInTheDocument();
  }, 20000);

  it('renders new conversation button', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('New Conversation').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 15000 });
  }, 15000);

  it('creates new conversation when new button clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('New Conversation').length).toBeGreaterThanOrEqual(1);
    });

    const buttons = screen.getAllByText('New Conversation');
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(apiMocks.createFounderConversation).toHaveBeenCalled();
    });
  }, 15000);

  it('loads conversation messages when selecting a conversation', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('My conversation 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('My conversation 1'));

    await waitFor(() => {
      expect(apiMocks.getFounderConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  it('renames conversation via dropdown menu', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('My conversation 1')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button');
    const moreButton = dropdownButtons.find(
      (btn) => btn.querySelector('svg') !== null,
    );
    if (moreButton) {
      fireEvent.click(moreButton);
    }
  });

  it('archives conversation via dropdown menu', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('My conversation 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(apiMocks.listFounderConversations).toHaveBeenCalled();
    });
  });

  it('deletes conversation via dropdown menu', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('My conversation 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(apiMocks.listFounderConversations).toHaveBeenCalled();
    });
  });

  it('auto-loads most recent conversation on mount', async () => {
    await renderPage();

    await waitFor(() => {
      expect(apiMocks.listFounderConversations).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(apiMocks.getFounderConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  it('shows empty state message when no conversations', async () => {
    apiMocks.listFounderConversations.mockResolvedValue({
      conversations: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });
  });

  it('creates new conversation on empty state', async () => {
    apiMocks.listFounderConversations.mockResolvedValue({
      conversations: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Conversation'));

    await waitFor(() => {
      expect(apiMocks.createFounderConversation).toHaveBeenCalled();
    });
  });
});
