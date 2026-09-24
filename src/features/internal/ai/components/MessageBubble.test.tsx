import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage, KnowledgeCitation } from '../types';

const mockCitation: KnowledgeCitation = {
  documentId: 'doc-123',
  documentName: 'Clinic Operations Guide.pdf',
  chunkIndex: 2,
  similarityScore: 0.88,
  excerpt: 'Front desk receptionists must confirm patient insurance before check-in.',
};

describe('MessageBubble — Knowledge Citations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          document: {
            id: 'doc-123',
            name: 'Clinic Operations Guide.pdf',
            status: 'ready',
            chunk_count: 5,
          },
          previewChunks: [
            {
              id: 'c-1',
              chunk_index: 2,
              content: 'Front desk receptionists must confirm patient insurance before check-in.',
              token_count: 12,
            },
          ],
        }),
    }));
  });

  it('renders citation cards below assistant response with correct details', () => {
    const assistantMessage: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Here is the clinic reception protocol.',
      timestamp: new Date(),
      citations: [mockCitation],
    };

    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByText('Here is the clinic reception protocol.')).toBeInTheDocument();
    expect(screen.getByTestId('message-citations')).toBeInTheDocument();
    expect(screen.getByText('Clinic Operations Guide.pdf')).toBeInTheDocument();
    expect(screen.getByText('(Chunk #3)')).toBeInTheDocument();
    expect(screen.getByText('88% match')).toBeInTheDocument();
    expect(
      screen.getByText('"Front desk receptionists must confirm patient insurance before check-in."')
    ).toBeInTheDocument();
  });

  it('does NOT render citations while message is actively streaming', () => {
    const streamingMessage: ChatMessage = {
      id: 'msg-streaming',
      role: 'assistant',
      content: 'Streaming chunk text...',
      timestamp: new Date(),
      isStreaming: true,
      streamingStatus: 'streaming',
      citations: [mockCitation],
    };

    render(<MessageBubble message={streamingMessage} />);

    expect(screen.getByText(/Streaming chunk text/)).toBeInTheDocument();
    expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();
  });

  it('renders citations after streaming finishes', () => {
    const completedStreamMessage: ChatMessage = {
      id: 'msg-finished',
      role: 'assistant',
      content: 'Streaming is now completely finished.',
      timestamp: new Date(),
      isStreaming: false,
      streamingStatus: 'complete',
      citations: [mockCitation],
    };

    render(<MessageBubble message={completedStreamMessage} />);

    expect(screen.getByText('Streaming is now completely finished.')).toBeInTheDocument();
    expect(screen.getByTestId('message-citations')).toBeInTheDocument();
    expect(screen.getByText('Clinic Operations Guide.pdf')).toBeInTheDocument();
  });

  it('does not render citations for user messages', () => {
    const userMessage: ChatMessage = {
      id: 'msg-user',
      role: 'user',
      content: 'Where can I find the guide?',
      timestamp: new Date(),
      citations: [mockCitation],
    };

    render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('Where can I find the guide?')).toBeInTheDocument();
    expect(screen.queryByTestId('message-citations')).not.toBeInTheDocument();
  });

  it('triggers onCitationClick and opens preview modal when citation card is clicked', async () => {
    const handleCitationClick = vi.fn();
    const assistantMessage: ChatMessage = {
      id: 'msg-click',
      role: 'assistant',
      content: 'Here is the source you requested.',
      timestamp: new Date(),
      citations: [mockCitation],
    };

    render(
      <MessageBubble
        message={assistantMessage}
        onCitationClick={handleCitationClick}
      />
    );

    const citationCard = screen.getByTestId('knowledge-citation-card');
    fireEvent.click(citationCard);

    expect(handleCitationClick).toHaveBeenCalledTimes(1);
    expect(handleCitationClick).toHaveBeenCalledWith(mockCitation);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-preview-modal')).toBeInTheDocument();
    });
  });
});
