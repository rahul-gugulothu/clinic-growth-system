import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeSearchBar } from './KnowledgeSearchBar';

describe('KnowledgeSearchBar', () => {
  it('renders search input, status filter, and archive checkbox', () => {
    render(
      <KnowledgeSearchBar
        query=""
        onQueryChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        includeArchived={false}
        onIncludeArchivedChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('knowledge-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-archive-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-search-clear')).not.toBeInTheDocument();
  });

  it('triggers onQueryChange when user types in search input', () => {
    const handleQueryChange = vi.fn();
    render(
      <KnowledgeSearchBar
        query=""
        onQueryChange={handleQueryChange}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        includeArchived={false}
        onIncludeArchivedChange={vi.fn()}
      />
    );

    const input = screen.getByTestId('knowledge-search-input');
    fireEvent.change(input, { target: { value: 'receptionist playbook' } });

    expect(handleQueryChange).toHaveBeenCalledWith('receptionist playbook');
  });

  it('renders clear button when query is present and triggers clear action', () => {
    const handleQueryChange = vi.fn();
    const handleClear = vi.fn();
    render(
      <KnowledgeSearchBar
        query="booking"
        onQueryChange={handleQueryChange}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        includeArchived={false}
        onIncludeArchivedChange={vi.fn()}
        onClear={handleClear}
      />
    );

    const clearButton = screen.getByTestId('knowledge-search-clear');
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(handleQueryChange).toHaveBeenCalledWith('');
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('triggers onStatusFilterChange when status dropdown changes', () => {
    const handleStatusFilterChange = vi.fn();
    render(
      <KnowledgeSearchBar
        query=""
        onQueryChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={handleStatusFilterChange}
        includeArchived={false}
        onIncludeArchivedChange={vi.fn()}
      />
    );

    const select = screen.getByTestId('knowledge-status-filter');
    fireEvent.change(select, { target: { value: 'ready' } });

    expect(handleStatusFilterChange).toHaveBeenCalledWith('ready');
  });

  it('triggers onIncludeArchivedChange when checkbox is toggled', () => {
    const handleIncludeArchivedChange = vi.fn();
    render(
      <KnowledgeSearchBar
        query=""
        onQueryChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        includeArchived={false}
        onIncludeArchivedChange={handleIncludeArchivedChange}
      />
    );

    const checkbox = screen.getByTestId('knowledge-archive-toggle');
    fireEvent.click(checkbox);

    expect(handleIncludeArchivedChange).toHaveBeenCalledWith(true);
  });

  it('calls onSearch when Enter key is pressed in the search input', () => {
    const handleSearch = vi.fn();
    render(
      <KnowledgeSearchBar
        query="pricing"
        onQueryChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        includeArchived={false}
        onIncludeArchivedChange={vi.fn()}
        onSearch={handleSearch}
      />
    );

    const input = screen.getByTestId('knowledge-search-input');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleSearch).toHaveBeenCalledTimes(1);
  });
});
