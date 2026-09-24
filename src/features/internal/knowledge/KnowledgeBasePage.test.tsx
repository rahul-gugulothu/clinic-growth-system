import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KnowledgeBasePage, type KnowledgeDocument } from './KnowledgeBasePage';

const mockDocuments: KnowledgeDocument[] = [
  {
    id: 'doc-1',
    name: 'Clinic Playbook.pdf',
    status: 'ready',
    chunkCount: 15,
    fileSize: 1048576, // 1 MB
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    name: 'Pricing Guidelines.docx',
    status: 'processing',
    chunkCount: 8,
    fileSize: 512000,
    createdAt: '2026-03-02T11:00:00Z',
  },
  {
    id: 'doc-3',
    name: 'Archived Onboarding.txt',
    status: 'archived',
    chunkCount: 5,
    fileSize: 12000,
    createdAt: '2026-02-15T09:00:00Z',
  },
];

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/preview')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              document: {
                id: 'doc-1',
                name: 'Clinic Playbook.pdf',
                status: 'ready',
                file_size_bytes: 1048576,
                chunk_count: 15,
                created_at: '2026-03-01T10:00:00Z',
              },
              previewChunks: [
                {
                  id: 'chunk-1',
                  chunk_index: 0,
                  content: 'Welcome to the clinic procedures guide.',
                  token_count: 8,
                },
              ],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ documents: mockDocuments }),
      });
    }));
  });

  it('renders header, metric cards, search bar, and active documents table', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    expect(screen.getByText('Founder Knowledge Base')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-documents-table')).toBeInTheDocument();

    // Archived doc (doc-3) should be excluded by default, so 2 active docs
    expect(screen.getByTestId('metric-total-docs')).toHaveTextContent('2');
    expect(screen.getByTestId('metric-ready-docs')).toHaveTextContent('1');
    expect(screen.getByTestId('metric-total-chunks')).toHaveTextContent('23'); // 15 + 8

    expect(screen.getByText('Clinic Playbook.pdf')).toBeInTheDocument();
    expect(screen.getByText('Pricing Guidelines.docx')).toBeInTheDocument();
    expect(screen.queryByText('Archived Onboarding.txt')).not.toBeInTheDocument();
  });

  it('displays accurate chunk counts for documents', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    const doc1Chunks = screen.getByTestId('chunk-count-doc-1');
    expect(doc1Chunks).toHaveTextContent('15');

    const doc2Chunks = screen.getByTestId('chunk-count-doc-2');
    expect(doc2Chunks).toHaveTextContent('8');
  });

  it('filters documents when search query is entered', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    const searchInput = screen.getByTestId('knowledge-search-input');
    fireEvent.change(searchInput, { target: { value: 'Pricing' } });

    expect(screen.queryByText('Clinic Playbook.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Pricing Guidelines.docx')).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-docs')).toHaveTextContent('1');
  });

  it('includes archived documents when the archive checkbox is toggled', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    expect(screen.queryByText('Archived Onboarding.txt')).not.toBeInTheDocument();

    const archiveToggle = screen.getByTestId('knowledge-archive-toggle');
    fireEvent.click(archiveToggle);

    expect(screen.getByText('Archived Onboarding.txt')).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-docs')).toHaveTextContent('3');
  });

  it('filters documents by status using dropdown', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    const statusFilter = screen.getByTestId('knowledge-status-filter');
    fireEvent.change(statusFilter, { target: { value: 'processing' } });

    expect(screen.queryByText('Clinic Playbook.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Pricing Guidelines.docx')).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-docs')).toHaveTextContent('1');
  });

  it('opens preview modal when Preview button is clicked', async () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    const previewButton = screen.getByTestId('preview-button-doc-1');
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-preview-modal')).toBeInTheDocument();
    });
  });

  it('displays empty state when no documents match active search', () => {
    render(<KnowledgeBasePage initialDocuments={mockDocuments} />);

    const searchInput = screen.getByTestId('knowledge-search-input');
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Document Query' } });

    expect(screen.getByText('No documents found')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-documents-table')).not.toBeInTheDocument();
  });
});
