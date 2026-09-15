import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Send,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Stethoscope,
  Sparkles,
  Search,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ActivityCenter } from '@/components/activity/ActivityCenter';

const NAV = [
  { to: '/internal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/internal/prospects', label: 'Prospects', icon: Users },
  { to: '/internal/audits', label: 'Audits', icon: ClipboardCheck },
  { to: '/internal/outreach', label: 'Outreach', icon: Send },
  { to: '/internal/sales', label: 'Sales / Proposals', icon: FileText },
  { to: '/internal/reports', label: 'Reports', icon: BarChart3 },
  { to: '/internal/ai', label: 'Founder AI', icon: Sparkles },
  { to: '/internal/settings', label: 'Settings', icon: Settings },
];

export default function InternalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useStore((s) => s.session);
  const logout = useStore((s) => s.logout);
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r bg-background md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Stethoscope className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Clinic Growth</div>
            <div className="text-xs text-muted-foreground">Internal workspace</div>
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
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} currentWorkspace={session.currentWorkspace} />
    </div>
  );
}