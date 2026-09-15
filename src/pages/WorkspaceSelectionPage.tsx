import { useNavigate } from 'react-router-dom';
import { Building2, Stethoscope, ArrowRight } from 'lucide-react';
import { useStore } from '@/store';
import type { Workspace } from '@/types/entities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';

export default function WorkspaceSelectionPage() {
  const navigate = useNavigate();
  const setWorkspace = useStore((s) => s.setWorkspace);
  const clinics = useStore((s) => s.clinics);
  const setActiveClinic = useStore((s) => s.setActiveClinic);

  const clinicCount = Object.keys(clinics).length;
  const hasClinic = clinicCount > 0;

  const onPick = (ws: Workspace, path: string) => {
    setWorkspace(ws);
    if (ws === 'clinic' && hasClinic) {
      const firstClinicId = Object.keys(clinics)[0];
      setActiveClinic(firstClinicId);
    }
    navigate(path, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal workspace for prospecting and onboarding. Clinic workspace for managing leads,
            appointments, and growth.
          </p>
        </div>
        <SyntheticDataBanner />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <Building2 className="h-6 w-6 text-primary" />
              <CardTitle className="mt-2">Internal Growth Workspace</CardTitle>
              <CardDescription>
                Find clinics, research, audit, contact, and convert them into pilot customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => onPick('internal', '/internal')}>
                Open Internal <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Stethoscope className={`h-6 w-6 ${hasClinic ? 'text-primary' : 'text-muted-foreground'}`} />
              <CardTitle className="mt-2">Clinic Workspace</CardTitle>
              <CardDescription>
                {hasClinic
                  ? 'Capture enquiries, qualify, book, follow up, and measure growth.'
                  : 'No clinic onboarded yet. Complete onboarding from the Internal workspace first.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                disabled={!hasClinic}
                onClick={() => onPick('clinic', '/clinic')}
              >
                {hasClinic ? 'Open Clinic' : 'No clinic available'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}