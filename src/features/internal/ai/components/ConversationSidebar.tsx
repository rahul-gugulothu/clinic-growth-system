import { useState, useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MoreVertical, Edit2, Archive, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { FounderConversationSummary } from '@/features/internal/ai/types/api';
import { useFounderConversation } from '@/features/internal/ai/context/FounderConversationContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ConversationSidebarProps {
  activeConversationId?: string;
  onNewConversation?: () => void;
}

export function ConversationSidebar({ activeConversationId, onNewConversation }: ConversationSidebarProps) {
  const {
    conversations,
    loading,
    selectConversation,
    createConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
  } = useFounderConversation();

  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewConversation = async () => {
    await createConversation();
    onNewConversation?.();
  };

  const handleSelect = (id: string) => {
    setDropdownOpenId(null);
    selectConversation(id);
  };

  const openRename = (conv: FounderConversationSummary) => {
    setRenameConversationId(conv.id);
    setRenameTitle(conv.title === 'New Conversation' ? '' : conv.title);
    setRenameDialogOpen(true);
    setDropdownOpenId(null);
  };

  const openDelete = (id: string) => {
    setDeleteConversationId(id);
    setDeleteDialogOpen(true);
    setDropdownOpenId(null);
  };

  const confirmRename = async () => {
    if (renameConversationId && renameTitle.trim()) {
      await renameConversation(renameConversationId, renameTitle.trim());
    }
    setRenameDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (deleteConversationId) {
      await deleteConversation(deleteConversationId);
    }
    setDeleteDialogOpen(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Founder AI</h2>
      </div>
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleNewConversation}
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No conversations yet</div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  className={cn(
                    'group relative flex flex-col gap-1 rounded-md p-2 cursor-pointer transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )}
                  onClick={() => handleSelect(conv.id)}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="truncate text-sm font-medium"
                      title={conv.title}
                    >
                      {conv.title || 'New Conversation'}
                    </span>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-accent/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpenId(dropdownOpenId === conv.id ? null : conv.id);
                      }}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(conv.updated_at)}
                  </span>

                  {dropdownOpenId === conv.id && (
                    <div
                      ref={dropdownRef}
                      className="absolute top-8 right-2 z-10 min-w-[120px] rounded-md border bg-popover p-1 shadow-md"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded p-1.5 text-xs hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(conv);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Rename
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded p-1.5 text-xs hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveConversation(conv.id);
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded p-1.5 text-xs text-destructive hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDelete(conv.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Enter conversation title"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setRenameDialogOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmRename} disabled={!renameTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Conversation?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The conversation will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
