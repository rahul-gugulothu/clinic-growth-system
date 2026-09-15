import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Send, ExternalLink, Calendar, TrendingUp, AlertTriangle, Lightbulb, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AuditFormModal } from '@/components/audit/AuditFormModal';
import { fmtDate } from '@/lib/format';

export default function AuditDetailPage() {
  const { auditId = '' } = useParams();
  const navigate = useNavigate();
  const audit = useStore((s) => s.audits[auditId]);
  const prospect = useStore((s) => (audit?.prospect_id ? s.prospects[audit.prospect_id] : undefined));
  const recordOutreach = useStore((s) => s.recordOutreach);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [outreachChannel, setOutreachChannel] = useState<'Email' | 'Phone' | 'WhatsApp' | 'InPerson'>('Email');
  const [outreachNextAction, setOutreachNextAction] = useState('Send follow-up');
  const [outreachOwner, setOutreachOwner] = useState('Founder');

  const oppTone = (o: string) =>
    o === 'High' ? 'success' : o === 'Medium' ? 'warning' : 'muted';

  const areaFields = useMemo(
    () => [
      { key: 'discovery', label: 'Search / Discovery' },
      { key: 'google_presence', label: 'Google Presence' },
      { key: 'website', label: 'Website' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'enquiry_process', label: 'Enquiry Process' },
      { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'booking', label: 'Booking' },
      { key: 'follow_up', label: 'Follow-up' },
      { key: 'content', label: 'Content' },
      { key: 'competitors', label: 'Competitors' },
    ] as const,
    []
  );

  const areasReviewed = useMemo(
    () => (audit ? areaFields.filter((f) => audit[f.key]?.trim()).length : 0),
    [audit, areaFields]
  );

  const weaknessesCount = useMemo(() => {
    if (!audit?.identified_problems?.trim()) return 0;
    return audit.identified_problems.split('\n').filter((l) => l.trim()).length;
  }, [audit?.identified_problems]);

  const recommendationsCount = useMemo(() => {
    if (!audit?.recommendations?.trim()) return 0;
    return audit.recommendations.split('\n').filter((l) => l.trim()).length;
  }, [audit?.recommendations]);

  if (!audit) {
    return (
      <div className="p-6">
        <p className="text-sm">Audit not found.</p>
        <Button asChild variant="link">
          <Link to="/internal/audits">Back to audits</Link>
        </Button>
      </div>
    );
  }

  const handleStartOutreach = () => {
    if (!audit.prospect_id) {
      toast.error('No prospect linked to this audit');
      return;
    }
    recordOutreach({
      prospect_id: audit.prospect_id,
      channel: outreachChannel,
      next_action: outreachNextAction,
      next_action_at: null,
      owner: outreachOwner,
    });
    toast.success('Outreach started');
    setShowOutreach(false);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/internal/audits')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to audits
        </Button>
        <div className="flex items-center gap-2">
          {prospect && (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/internal/prospects/${prospect.prospect_id}`}>
                <ArrowRight className="mr-2 h-4 w-4" /> Prospect
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditModalOpen(true)}>
            <FileText className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowOutreach((v) => !v)}>
            <Send className="mr-2 h-4 w-4" /> {showOutreach ? 'Cancel' : 'Start outreach'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/internal/ai', { state: { auditId, returnTo: { pathname: `/internal/audits/${auditId}` } } })}>
            <Sparkles className="mr-2 h-4 w-4" /> Explain Growth Opportunities
          </Button>
        </div>
      </div>

      {showOutreach && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="outreach-channel">Channel</Label>
              <Select id="outreach-channel" value={outreachChannel} onChange={(e) => setOutreachChannel(e.target.value as any)}>
                <option>Email</option>
                <option>Phone</option>
                <option>WhatsApp</option>
                <option>InPerson</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="outreach-next">Next action</Label>
              <Input id="outreach-next" value={outreachNextAction} onChange={(e) => setOutreachNextAction(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="outreach-owner">Owner</Label>
              <Input id="outreach-owner" value={outreachOwner} onChange={(e) => setOutreachOwner(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={handleStartOutreach}>Record outreach</Button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
          <p className="text-sm text-muted-foreground">
            {prospect ? (
              <>
                For{' '}
                <Link to={`/internal/prospects/${prospect.prospect_id}`} className="text-primary hover:underline">
                  {prospect.clinic_name}
                </Link>
              </>
            ) : (
              '—'
            )}{' '}
            · {fmtDate(audit.audit_date)}
          </p>
        </div>
        <Badge tone={oppTone(audit.overall_opportunity)} className="text-sm">
          {audit.overall_opportunity} opportunity
        </Badge>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Audit summary</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Opportunity:</span>
            <span className="font-medium">{audit.overall_opportunity}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Areas reviewed:</span>
            <span className="font-medium">{areasReviewed} / {areaFields.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Weaknesses:</span>
            <span className="font-medium">{weaknessesCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Recommendations:</span>
            <span className="font-medium">{recommendationsCount}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Audit findings</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areaFields.map((f) => (
            <div key={f.key} className="rounded-md border p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{f.label}</div>
              <p className="text-sm whitespace-pre-wrap">{audit[f.key] || '—'}</p>
            </div>
          ))}
        </div>
      </section>

      {prospect && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Evidence</h2>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Research date:</span>
              <span className="font-medium">{fmtDate(prospect.research_date)}</span>
            </div>
            {prospect.source_urls.length > 0 ? (
              <div className="space-y-1">
                <span className="text-muted-foreground">Source URLs</span>
                <ul className="space-y-1">
                  {prospect.source_urls.map((url, idx) => (
                    <li key={idx}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No source URLs recorded.</p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Strengths</h2>
        {areasReviewed > 0 ? (
          <p className="text-sm text-muted-foreground">
            {areasReviewed} area{areasReviewed === 1 ? '' : 's'} documented. Explicit strengths are not captured separately in the current audit model.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No findings recorded yet.</p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Observed weaknesses</h2>
        {audit.identified_problems?.trim() ? (
          <ul className="space-y-2 text-sm">
            {audit.identified_problems.split('\n').map((line, idx) => {
              const text = line.trim();
              if (!text) return null;
              return (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-medium">{text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No observed weaknesses recorded.</p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Growth opportunities</h2>
        {recommendationsCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {recommendationsCount} recommendation{recommendationsCount === 1 ? '' : 's'} documented. Each recommendation reflects an interpreted growth opportunity.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No growth opportunities documented yet.</p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recommended actions</h2>
        {audit.recommendations?.trim() ? (
          <ul className="space-y-2 text-sm">
            {audit.recommendations.split('\n').map((line, idx) => {
              const text = line.trim();
              if (!text) return null;
              return (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-blue-500" />
                  <span className="font-medium">{text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recommended actions recorded.</p>
        )}
      </section>

      <AuditFormModal
        prospectId={audit.prospect_id || prospect?.prospect_id || ''}
        prospectName={prospect?.clinic_name || '—'}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        audit={audit}
      />
    </div>
  );
}
