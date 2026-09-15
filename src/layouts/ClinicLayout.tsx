import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Calendar,
  ListChecks,
  Star,
  BarChart3,
  Settings,
  LogOut,
  Stethoscope,
  Search,
  Menu,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ActivityCenter } from '@/components/activity/ActivityCenter';

const NAV = [
  { to: '/clinic', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clinic/leads', label: 'Leads', icon: Users },
  { to: '/clinic/conversations', label: 'Conversations', icon: MessageSquare },
  { to: '/clinic/appointments', label: 'Appointments', icon: Calendar },
  { to: '/clinic/follow-ups', label: 'Follow-ups', icon: ListChecks },
  { to: '/clinic/reviews', label: 'Reviews', icon: Star },
  { to: '/clinic/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/clinic/settings', label: 'Settings', icon: Settings },
];

export default function ClinicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useStore((s) => s.session);
  const logout = useStore((s) => s.logout);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-muted/30 overflow-x-hidden">
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-background z-30 flex items-center justify-between px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Clinic Growth</span>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'w-64 shrink-0 border-r bg-background flex flex-col',
          'fixed inset-y-0 left-0 z-50 -translate-x-full',
          'transition-transform duration-300 ease-in-out',
          'md:static md:z-auto md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Stethoscope className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Clinic Growth</div>
            <div className="text-xs text-muted-foreground">Clinic workspace</div>
          </div>
          <ActivityCenter workspace={session.currentWorkspace} />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.email || 'demo user'}</span>
            <br />
            Role: {session.currentRole}
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="w-full" onClick={() => setSearchOpen(true)}>
              <Search className="mr-2 h-3 w-3" />
              Search
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
              <LogOut className="mr-2 h-3 w-3" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden pt-16 md:pt-0">
        <Outlet />
      </main>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} currentWorkspace={session.currentWorkspace} />
    </div>
  );
}