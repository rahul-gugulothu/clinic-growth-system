import { useStore, selectReferralsByClinic } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ReferralsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const referrals = useStore((s) => (clinicId ? selectReferralsByClinic(clinicId)(s) : []));
  const addReferral = useStore((s) => s.addReferral);
  const leads = useStore((s) => (clinicId ? Object.values(s.leads).filter((l) => l.clinic_id === clinicId) : []));

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const referringId = (data.get('referring') as string) || null;
    const referredId = (data.get('referred') as string) || null;
    if (!referringId || !referredId) {
      toast.error('Select both referring and referred leads');
      return;
    }
    addReferral({ clinic_id: clinicId, referring_lead_id: referringId, referred_lead_id: referredId });
    toast.success('Referral recorded');
    form.reset();
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">Track patient referrals and outcomes. Placeholder for V1.</p>
      </div>

      <SyntheticDataBanner />

      <Card>
        <CardHeader>
          <CardTitle>{referrals.length} referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Referral</TH>
                  <TH>Referring lead</TH>
                  <TH>Referred lead</TH>
                  <TH>Created</TH>
                  <TH>Status</TH>
                  <TH>Outcome</TH>
                </TR>
              </THead>
              <TBody>
                {referrals.map((r) => (
                  <TR key={r.referral_id}>
                    <TD className="font-medium">{r.referral_id}</TD>
                    <TD>{r.referring_lead_id ?? '—'}</TD>
                    <TD>{r.referred_lead_id ?? '—'}</TD>
                    <TD>{new Date(r.created_at).toLocaleDateString('en-IN')}</TD>
                    <TD>
                      <Badge tone={r.status === 'Converted' ? 'success' : r.status === 'New' ? 'info' : 'muted'}>
                        {r.status}
                      </Badge>
                    </TD>
                    <TD>{r.outcome || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add referral</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Referring lead</Label>
              <select name="referring" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select lead</option>
                {leads.map((l) => (
                  <option key={l.lead_id} value={l.lead_id}>{l.lead_id} — {l.service_interested}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Referred lead</Label>
              <select name="referred" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select lead</option>
                {leads.map((l) => (
                  <option key={l.lead_id} value={l.lead_id}>{l.lead_id} — {l.service_interested}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Record referral</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
