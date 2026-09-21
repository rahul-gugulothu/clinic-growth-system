import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, ArrowRight } from 'lucide-react';
import { useStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/input';
import { login as apiLogin } from '@/api/client';

const BACKEND_ROLE_TO_FRONTEND: Record<string, 'founder' | 'intern' | 'clinicOwner' | 'clinicStaff'> = {
  org_admin: 'founder',
  founder: 'founder',
  clinic_owner: 'clinicOwner',
  clinic_doctor: 'clinicStaff',
  clinic_reception: 'clinicStaff',
  clinic_coordinator: 'clinicStaff',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const storeLogin = useStore((s) => s.login);
  const [email, setEmail] = useState('founder@cliniciogrowth.local');
  const [err, setErr] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErr('Email is required.');
      return;
    }
    setIsLoading(true);
    setErr(null);

    try {
      const { user } = await apiLogin(email);
      const role = (BACKEND_ROLE_TO_FRONTEND[user.role] ?? 'founder') as 'founder' | 'intern' | 'clinicOwner' | 'clinicStaff';
      storeLogin(email, role);
      navigate('/select-workspace', { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Login failed. Please try again.';
      setErr(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Clinic Growth System</span>
          </div>
          <CardTitle>Sign in to Clinic Growth System</CardTitle>
          <CardDescription>
            Enter your email to authenticate against the backend. Use seeded dev accounts
            (e.g. founder@cliniciogrowth.local).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinicgrowth.local"
                autoFocus
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Continue'}
              <ArrowRight className={`ml-2 h-4 w-4 ${isLoading ? 'hidden' : ''}`} />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
