import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sparkles, Search } from 'lucide-react';
import { useStore } from '@/store';
import { buildSearchIndex, filterItems, groupResults, type SearchItem, type SearchGroup } from './searchIndex';
import { CommandResult } from './CommandResult';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkspace: 'internal' | 'clinic' | null;
}

export function CommandPalette({ open, onOpenChange, currentWorkspace }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const storeState = useStore.getState();
  const allItems = useMemo(() => buildSearchIndex(storeState, { currentWorkspace, activeClinicId: storeState.session.activeClinicId }), [currentWorkspace, storeState]);
  
  const filtered = useMemo(() => filterItems(allItems, query), [allItems, query]);
  const groups = useMemo(() => groupResults(filtered), [filtered]);

  const actionItems: SearchItem[] = useMemo(() => {
    const actions: SearchItem[] = [];
    if (currentWorkspace === 'internal' || currentWorkspace === null) {
      actions.push({
        id: 'open-founder-ai',
        type: 'action',
        title: 'Open Founder AI',
        subtitle: 'Navigate to internal AI command center',
        href: '/internal/ai',
        workspace: 'internal',
      });
    }
    return actions;
  }, [currentWorkspace]);

  const allGroups = useMemo(() => {
    const result: SearchGroup[] = [];
    if (query.trim() === '' && actionItems.length > 0) {
      result.push({ label: 'Actions', items: actionItems });
    }
    result.push(...groups);
    return result;
  }, [groups, actionItems, query]);

  const totalFlat = useMemo(() => allGroups.flatMap((g) => g.items), [allGroups]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalFlat.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalFlat.length) % totalFlat.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = totalFlat[selectedIndex];
        if (selected?.href) {
          navigate(selected.href);
        }
        onOpenChange(false);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, navigate, selectedIndex, totalFlat]);

  useEffect(() => {
    if (!listRef.current || totalFlat.length === 0) return;
    const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, totalFlat.length]);

  const renderEmpty = () => (
    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      {query.trim() ? 'No matching records found.' : 'Start typing to search across records.'}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4 text-muted-foreground" />
            Search
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 py-3">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prospects, leads, clinics..."
            className="h-9"
          />
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-2 pb-2">
          {totalFlat.length === 0 ? (
            renderEmpty()
          ) : (
            allGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
                {group.items.map((item) => {
                  const globalIndex = totalFlat.indexOf(item);
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-index={globalIndex}
                      className={isSelected ? 'bg-accent' : ''}
                    >
                      <CommandResult item={item} onNavigate={() => onOpenChange(false)} />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
          {actionItems.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => {
                const ai = actionItems.find((a) => a.href === '/internal/ai');
                if (ai?.href) navigate(ai.href);
                onOpenChange(false);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Open Founder AI
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
