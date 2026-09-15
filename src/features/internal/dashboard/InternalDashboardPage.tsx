import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, selectAllProspects, selectAllAudits, selectAllOutreach, selectAllProposals, selectClinics } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import { Users, FileText, IndianRupee, TrendingUp, ExternalLink } from 'lucide-react';
import { fmtDate, fmtCurrency } from '@/lib/format';
import { OUTREACH_STAGES } from '@/types/status';

function priorityTone(priority: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' {
  switch (priority) {
    case 'High':
      return 'warning';
    case 'Medium':
      return 'info';
    case 'Low':
      return 'muted';
    default:
      return 'default';
  }
}

export default function InternalDashboardPage() {
  const prospects = useStore(selectAllProspects);
  const audits = useStore(selectAllAudits);
  const outreach = useStore(selectAllOutreach);
  const proposals = useStore(selectAllProposals);
  const clinics = useStore(selectClinics);

  const auditedCount = audits.length;
  const contactedCount = outreach.filter((o) =>
    OUTREACH_STAGES.indexOf(o.stage) >= OUTREACH_STAGES.indexOf('Contacted'),
  ).length;
  const respondedCount = outreach.filter((o) =>
    ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage),
  ).length;
  const callCount = outreach.filter((o) =>
    ['Call', 'Proposal', 'Won'].includes(o.stage),
  ).length;
  const proposalCount = proposals.filter((p) => ['Sent', 'Accepted'].includes(p.status)).length;
  const wonCount = proposals.filter((p) => p.status === 'Accepted').length;
  const clientsOnboarded = clinics.length;
  const pipelineValue = proposals
    .filter((p) => p.status !== 'Lost')
    .reduce((sum, p) => sum + p.price_inr, 0);
  const wonValue = proposals
    .filter((p) => p.status === 'Accepted')
    .reduce((sum, p) => sum + p.price_inr, 0);

  const needsAttention = useMemo(() => {
    const items: { id: string; label: string; href: string; tone: 'warning' | 'destructive' | 'info' }[] = [];
    for (const p of prospects) {
      if (p.priority === 'High') {
        const prospectOutreach = outreach.filter((o) => o.prospect_id === p.prospect_id);
        if (prospectOutreach.length === 0) {
          items.push({ id: p.prospect_id, label: `${p.clinic_name} — high priority, not contacted`, href: `/internal/prospects/${p.prospect_id}`, tone: 'warning' });
        }
      }
    }
    for (const o of outreach) {
      if (o.stage === 'Responded' && o.next_action_at) {
        const next = new Date(o.next_action_at);
        if (next < new Date()) {
          const prospect = prospects.find((p) => p.prospect_id === o.prospect_id);
          items.push({ id: o.outreach_id, label: `${prospect?.clinic_name ?? 'Prospect'} — responded, follow-up overdue`, href: `/internal/outreach`, tone: 'destructive' });
        }
      }
    }
    for (const p of proposals) {
      if (p.status === 'Sent') {
        const prospect = prospects.find((pr) => pr.prospect_id === p.prospect_id);
        items.push({ id: p.proposal_id, label: `${prospect?.clinic_name ?? 'Prospect'} — proposal awaiting decision`, href: `/internal/sales`, tone: 'info' });
      }
    }
    return items.slice(0, 6);
  }, [prospects, outreach, proposals]);

  const recentActivity = useMemo(() => {
    const events: { id: string; label: string; date: string; href?: string }[] = [];
    for (const p of prospects) {
      events.push({ id: p.prospect_id, label: `New prospect: ${p.clinic_name}`, date: p.created_at, href: `/internal/prospects/${p.prospect_id}` });
    }
    for (const a of audits) {
      events.push({ id: a.audit_id, label: `Audit completed: ${a.prospect_id ? prospects.find((p) => p.prospect_id === a.prospect_id)?.clinic_name ?? a.prospect_id : 'Unknown'}`, date: a.created_at, href: `/internal/audits` });
    }
    for (const o of outreach) {
      events.push({ id: o.outreach_id, label: `Outreach: ${o.stage} — ${o.prospect_id}`, date: o.updated_at, href: `/internal/outreach` });
    }
    for (const p of proposals) {
      events.push({ id: p.proposal_id, label: `Proposal ${p.status}: ${p.prospect_id}`, date: p.created_at, href: `/internal/sales` });
    }
    for (const c of clinics) {
      events.push({ id: c.clinic_id, label: `Clinic onboarded: ${c.name}`, date: c.created_at, href: `/clinic` });
    }
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  }, [prospects, audits, outreach, proposals, clinics]);

  const priorityProspects = useMemo(() => {
    return prospects
      .filter((p) => p.priority === 'High')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
  }, [prospects]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Growth Dashboard</h1>
        <p className="text-sm text-muted-foreground">Clinic acquisition and onboarding pipeline</p>
      </div>

      <SyntheticDataBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/internal/prospects" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active prospects</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{prospects.length}</div>
              <p className="text-xs text-muted-foreground">{auditedCount} audited</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/internal/sales" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Proposals</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{proposalCount}</div>
              <p className="text-xs text-muted-foreground">{wonCount} won</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients onboarded</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{clientsOnboarded}</div>
            <p className="text-xs text-muted-foreground">Clinics in system</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline value</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmtCurrency(pipelineValue)}</div>
            <p className="text-xs text-muted-foreground">{fmtCurrency(wonValue)} won</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {[
                { stage: 'Prospects', count: prospects.length, pct: 100 },
                { stage: 'Audited', count: auditedCount, pct: prospects.length ? Math.round((auditedCount / prospects.length) * 100) : 0 },
                { stage: 'Contacted', count: contactedCount, pct: prospects.length ? Math.round((contactedCount / prospects.length) * 100) : 0 },
                { stage: 'Responded', count: respondedCount, pct: contactedCount ? Math.round((respondedCount / contactedCount) * 100) : 0 },
                { stage: 'Call', count: callCount, pct: respondedCount ? Math.round((callCount / respondedCount) * 100) : 0 },
                { stage: 'Proposal', count: proposalCount, pct: callCount ? Math.round((proposalCount / callCount) * 100) : 0 },
                { stage: 'Won', count: wonCount, pct: proposalCount ? Math.round((wonCount / proposalCount) * 100) : 0 },
              ].map((s) => (
                <div key={s.stage} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-muted-foreground">{s.stage}</div>
                  <div className="flex-1 h-8 rounded-md bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-md bg-primary/80 transition-all"
                      style={{ width: `${Math.max(s.pct, 4)}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-sm font-medium">{s.count}</div>
                  <div className="w-16 text-right text-xs text-muted-foreground">{s.pct}%</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {needsAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground">No immediate actions flagged.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {needsAttention.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                  >
                    <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent pipeline activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(item.date)}</span>
                    {item.href && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={item.href}><ExternalLink className="h-3 w-3" /></Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority prospects</CardTitle>
          </CardHeader>
          <CardContent>
            {priorityProspects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No high-priority prospects.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {priorityProspects.map((p) => (
                  <div key={p.prospect_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{p.clinic_name}</div>
                      <div className="text-xs text-muted-foreground">{p.doctor_name} · {p.area} · {p.specialty}</div>
                    </div>
                    <Badge tone={priorityTone(p.priority)}>{p.priority}</Badge>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/internal/prospects/${p.prospect_id}`}><ExternalLink className="h-3 w-3" /></Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link to="/internal/prospects">
            <Button>Add prospect</Button>
          </Link>
          <Link to="/internal/audits">
            <Button variant="outline">Create audit</Button>
          </Link>
          <Link to="/internal/outreach">
            <Button variant="outline">Record outreach</Button>
          </Link>
          <Link to="/internal/sales">
            <Button variant="outline">Create proposal</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
