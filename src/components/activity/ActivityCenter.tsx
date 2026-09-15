import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { useStore } from '@/store';
import { selectInternalActivityItems, selectClinicActivityItems, groupActivityItems } from './activitySelectors';

interface ActivityCenterProps {
  workspace: 'internal' | 'clinic' | null;
}

const toneIcon = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
};

export function ActivityCenter({ workspace }: ActivityCenterProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const state = useStore.getState();
  const items =
    workspace === 'clinic'
      ? selectClinicActivityItems(state, state.session.activeClinicId)
      : selectInternalActivityItems(state);

  const groups = groupActivityItems(items);
  const unreadCount = items.length;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleNavigate = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Activity center"
        title="Activity center"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-80 rounded-md border bg-background shadow-lg',
            'max-h-[70vh] overflow-y-auto',
          )}
          role="menu"
          aria-label="Activity center"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Activity</span>
            {unreadCount > 0 && (
              <Badge tone="muted">{unreadCount} item{unreadCount !== 1 ? 's' : ''}</Badge>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No items need your attention.
            </div>
          ) : (
            <div className="p-2">
              {groups.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = toneIcon[item.priority];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleNavigate(item.href)}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', item.priority === 'high' ? 'text-destructive' : item.priority === 'medium' ? 'text-warning' : 'text-muted-foreground')} />
                        <div className="flex-1">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
