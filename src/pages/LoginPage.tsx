import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, ArrowRight } from 'lucide-react';
import { useStore } from '@/store';
import type { Role } from '@/types/entities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('demo@clinicgrowth.local');
  const [password, setPassword] = useState('demo');
  const [role, setRole] = useState<Role>('founder');
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErr('Email and password are required.');
      return;
    }
    login(email, role);
    navigate('/select-workspace', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">V1 Prototype</span>
          </div>
          <CardTitle>Sign in to Clinic Growth System</CardTitle>
          <CardDescription>
            Demo authentication — any credentials are accepted. Pick a role to simulate.
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="founder">Founder</option>
                <option value="intern">Intern</option>
                <option value="clinicOwner">Clinic Owner</option>
                <option value="clinicStaff">Clinic Staff</option>
              </Select>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}