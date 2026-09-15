import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store';
import { toast } from 'sonner';

export default function InternalSettingsPage() {
  const reset = useStore((s) => s.resetDemo);
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Internal settings</h1>
        <p className="text-sm text-muted-foreground">Configure the internal workspace.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Demo data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Reset all prospect, audit, outreach, proposal, and clinic data to the original demo seed.
            Useful after testing the Golden Path A.
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              reset();
              toast.success('Demo data reset to seed.');
            }}
          >
            Reset demo data
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Roles & permissions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Role selection is simulated on the login screen. Real RBAC is out of scope for V1.
        </CardContent>
      </Card>
    </div>
  );
}