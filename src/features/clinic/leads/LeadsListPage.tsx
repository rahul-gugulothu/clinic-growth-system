import { Link } from 'react-router-dom';
import { useStore, selectLeadsByClinic } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/format';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';

export default function LeadsListPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const leads = useStore((s) => (clinicId ? selectLeadsByClinic(clinicId)(s) : []));

  const statusTone = (s: string) => {
    if (s === 'New') return 'info';
    if (s === 'Qualified' || s === 'Booked') return 'success';
    if (s === 'Attended') return 'success';
    if (s === 'Lost') return 'destructive';
    return 'muted';
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Manage enquiries entering the clinic growth funnel.
        </p>
      </div>

      <SyntheticDataBanner />

      <Card>
        <CardHeader>
          <CardTitle>{leads.length} leads</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Lead ID</TH>
                  <TH>Source</TH>
                  <TH>Service interested</TH>
                  <TH>Status</TH>
                  <TH>Assigned staff</TH>
                  <TH>Last contact</TH>
                  <TH>Next action</TH>
                </TR>
              </THead>
              <TBody>
                {leads.map((l) => (
                  <TR key={l.lead_id}>
                    <TD className="font-medium">
                      <Link to={`/clinic/leads/${l.lead_id}`} className="text-primary hover:underline">
                        {l.lead_id}
                      </Link>
                    </TD>
                    <TD>{l.source}</TD>
                    <TD>{l.service_interested}</TD>
                    <TD>
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </TD>
                    <TD>{l.assigned_staff_id ?? '—'}</TD>
                    <TD className="text-xs text-muted-foreground">{fmtDate(l.last_contact_at)}</TD>
                    <TD className="text-xs">{l.next_action}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}