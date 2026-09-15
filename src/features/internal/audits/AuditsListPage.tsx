import { Link } from 'react-router-dom';
import { useStore, selectAllAudits } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/format';

export default function AuditsListPage() {
  const audits = useStore(selectAllAudits);
  const getProspect = useStore((s) => s.prospects);

  const oppTone = (o: string) =>
    o === 'High' ? 'success' : o === 'Medium' ? 'warning' : 'muted';

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
        <p className="text-sm text-muted-foreground">
          Structured assessments of prospect clinics. Open one to view findings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{audits.length} audits</CardTitle>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audits yet. Open a prospect and use <strong>Create audit</strong>.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Clinic</TH>
                  <TH>Audit date</TH>
                  <TH>Opportunity</TH>
                  <TH>Problems</TH>
                </TR>
              </THead>
              <TBody>
                {audits.map((a) => {
                  const p = a.prospect_id ? getProspect[a.prospect_id] : null;
                  return (
                    <TR key={a.audit_id}>
                      <TD className="font-medium">
                        <Link
                          to={`/internal/audits/${a.audit_id}`}
                          className="text-primary hover:underline"
                        >
                          {p?.clinic_name ?? '—'}
                        </Link>
                      </TD>
                      <TD>{fmtDate(a.audit_date)}</TD>
                      <TD>
                        <Badge tone={oppTone(a.overall_opportunity)}>{a.overall_opportunity}</Badge>
                      </TD>
                      <TD className="max-w-[40ch] truncate" title={a.identified_problems}>
                        {a.identified_problems || '—'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}