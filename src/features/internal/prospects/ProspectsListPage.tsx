import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useStore, selectAllProspects } from '@/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/format';

export default function ProspectsListPage() {
  const prospects = useStore(selectAllProspects);

  const priorityTone = (p: string) =>
    p === 'High' ? 'destructive' : p === 'Medium' ? 'warning' : 'muted';

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground">
            Research and qualification pipeline for new clinic prospects.
          </p>
        </div>
        <Button disabled title="Add prospect is reserved for a later milestone">
          <Plus className="mr-2 h-4 w-4" />
          Add prospect
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{prospects.length} prospects</CardTitle>
        </CardHeader>
        <CardContent>
          {prospects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prospects yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Clinic</TH>
                  <TH>Doctor</TH>
                  <TH>Area</TH>
                  <TH>Specialty</TH>
                  <TH>Rating</TH>
                  <TH>Booking</TH>
                  <TH>WhatsApp</TH>
                  <TH>Priority</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {prospects.map((p) => (
                  <TR key={p.prospect_id}>
                    <TD className="font-medium">
                      <Link to={`/internal/prospects/${p.prospect_id}`} className="text-primary hover:underline">
                        {p.clinic_name}
                      </Link>
                    </TD>
                    <TD>{p.doctor_name}</TD>
                    <TD>{p.area}</TD>
                    <TD>{p.specialty}</TD>
                    <TD>
                      {p.google_rating ?? '—'}
                      {p.review_count != null && (
                        <span className="text-xs text-muted-foreground"> ({p.review_count})</span>
                      )}
                    </TD>
                    <TD>{p.booking_available ? 'Yes' : 'No'}</TD>
                    <TD>{p.whatsapp_available ? 'Yes' : 'No'}</TD>
                    <TD>
                      <Badge tone={priorityTone(p.priority)}>{p.priority}</Badge>
                    </TD>
                    <TD className="text-xs text-muted-foreground">{fmtDate(p.updated_at)}</TD>
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