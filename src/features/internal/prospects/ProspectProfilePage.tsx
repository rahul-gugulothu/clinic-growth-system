import { useNavigate, useParams, Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { ArrowLeft, ClipboardCheck, Send, FileText, Plus, ExternalLink, Phone, Globe, Instagram, MapPin, Star, Calendar, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  useStore,
  selectProspectById,
  selectAuditsByProspect,
  selectOutreachByProspect,
  selectProposalsByProspect,
} from '@/store';
import type { OutreachRecord } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AuditFormModal } from '@/components/audit/AuditFormModal';
import type { OutreachStage } from '@/types/status';
import { OUTREACH_STAGE_TRANSITIONS } from '@/types/status';
import { fmtDate } from '@/lib/format';

function parseNotes(notes: string): { facts: string[]; observations: string[] } {
  const facts: string[] = [];
  const observations: string[] = [];
  const factMatch = notes.match(/(?:Verified facts|Fact):\s*([^.]+(?:\.[^O][^b][^s][^e][^r][^v][^a][^t][^i][^o][^n]*)?)/i);
  const obsMatch = notes.match(/Observation:\s*([^.]*(?:\.[^H][^y][^p][^o][^t][^h][^e][^s][^i][^s]*)?)/i);
  const hypMatch = notes.match(/Hypothesis:\s*([^.]+)/i);

  if (factMatch) facts.push(factMatch[1].trim());
  if (obsMatch) observations.push(obsMatch[1].trim());
  if (hypMatch) observations.push(hypMatch[1].trim());

  if (facts.length === 0 && observations.length === 0 && notes) {
    observations.push(notes);
  }

  return { facts, observations };
}

function getNextAction(outreach: OutreachRecord[]): { label: string; stage?: OutreachStage } | null {
  if (outreach.length === 0) {
    return { label: 'Create audit first, then start outreach' };
  }
  const latest = [...outreach].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const transitions = OUTREACH_STAGE_TRANSITIONS[latest.stage];
  if (transitions.length === 0) {
    return { label: latest.stage === 'Won' ? 'Onboard clinic' : 'No further actions' };
  }
  return { label: `Advance outreach`, stage: transitions[0] };
}

export default function ProspectProfilePage() {
  const { prospectId = '' } = useParams();
  const navigate = useNavigate();
  const prospect = useStore(selectProspectById(prospectId));
  const audits = useStore(selectAuditsByProspect(prospectId));
  const outreach = useStore(selectOutreachByProspect(prospectId));
  const proposals = useStore(selectProposalsByProspect(prospectId));
  const updateProspect = useStore((s) => s.updateProspect);
  const setOutreachStage = useStore((s) => s.setOutreachStage);

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const sortedOutreach = useMemo(
    () => [...outreach].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [outreach]
  );
  const latestOutreach = sortedOutreach[0];
  const validNextStages = latestOutreach ? OUTREACH_STAGE_TRANSITIONS[latestOutreach.stage] || [] : [];

  const { facts: parsedFacts, observations: parsedObservations } = useMemo(
    () => parseNotes(prospect?.notes || ''),
    [prospect?.notes]
  );

  const nextAction = useMemo(() => getNextAction(sortedOutreach), [sortedOutreach]);

  const verifiedFacts = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (prospect) {
      items.push({ label: 'Website', value: prospect.website ? 'Present' : 'Absent' });
      items.push({ label: 'Booking form', value: prospect.booking_available ? 'Available' : 'Not available' });
      items.push({ label: 'WhatsApp', value: prospect.whatsapp_available ? 'Available' : 'Not available' });
      if (prospect.google_rating !== null) {
        items.push({ label: 'Google rating', value: `${prospect.google_rating} (${prospect.review_count ?? 0} reviews)` });
      }
      if (prospect.instagram_url) {
        items.push({ label: 'Instagram', value: 'Present' });
      }
      items.push({ label: 'Content quality', value: prospect.content_quality });
      if (prospect.visible_advertising) {
        items.push({ label: 'Visible advertising', value: prospect.visible_advertising });
      }
      parsedFacts.forEach((f) => items.push({ label: 'Research note', value: f }));
    }
    return items;
  }, [prospect, parsedFacts]);

  if (!prospect) {
    return (
      <div className="p-6">
        <p className="text-sm">Prospect not found.</p>
        <Button asChild variant="link">
          <Link to="/internal/prospects">Back to prospects</Link>
        </Button>
      </div>
    );
  }

  const priorityTone = (p: string) =>
    p === 'High' ? 'destructive' : p === 'Medium' ? 'warning' : 'muted';

  const handleSaveNote = () => {
    updateProspect(prospectId, { notes: noteDraft });
    setShowNoteEditor(false);
    toast.success('Note saved');
  };

  const handleAdvanceStage = (stage: OutreachStage) => {
    if (latestOutreach) {
      setOutreachStage(latestOutreach.outreach_id, stage);
      toast.success(`Moved to ${stage}`);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/internal/prospects')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to prospects
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{prospect.clinic_name}</h1>
          <p className="text-sm text-muted-foreground">
            {prospect.doctor_name} · {prospect.specialty} · {prospect.area}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Badge tone={priorityTone(prospect.priority)}>{prospect.priority} priority</Badge>
            <span className="text-xs text-muted-foreground">
              Researched {fmtDate(prospect.research_date)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="priority" className="text-xs">Priority</Label>
            <Select
              id="priority"
              value={prospect.priority}
              onChange={(e) => updateProspect(prospectId, { priority: e.target.value as 'Low' | 'Medium' | 'High' })}
              className="h-9 w-28"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAuditModalOpen(true)}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Create audit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowOutreach((v) => !v)}>
            <Send className="mr-2 h-4 w-4" /> {showOutreach ? 'Cancel' : 'Start outreach'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setNoteDraft(prospect.notes || ''); setShowNoteEditor((v) => !v); }}>
            <Plus className="mr-2 h-4 w-4" /> {showNoteEditor ? 'Cancel' : 'Add note'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/internal/ai', { state: { prospectId, returnTo: { pathname: `/internal/prospects/${prospectId}` } } })}>
            <Sparkles className="mr-2 h-4 w-4" /> Ask Founder AI
          </Button>
          {validNextStages.length > 0 && (
            <Select
              value=""
              onChange={(e) => {
                const stage = e.target.value as OutreachStage;
                if (stage) handleAdvanceStage(stage);
              }}
              className="h-9"
            >
              <option value="">Move to next stage…</option>
              {validNextStages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {showOutreach && (
        <OutreachForm
          prospectId={prospect.prospect_id}
          onDone={() => {
            setShowOutreach(false);
            toast.success('Outreach recorded');
          }}
        />
      )}

      {showNoteEditor && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <Label htmlFor="note-editor">Internal note</Label>
          <Textarea
            id="note-editor"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add research notes, observations, or hypotheses..."
            className="min-h-[120px]"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveNote}>Save note</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNoteEditor(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Clinic overview</h2>
          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Phone</span>
                <div className="font-medium">{prospect.phone || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Website</span>
                {prospect.website ? (
                  <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                    {prospect.website.replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <div className="font-medium">—</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Instagram className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Instagram</span>
                {prospect.instagram_url ? (
                  <a href={prospect.instagram_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                    {prospect.instagram_url.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@')} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <div className="font-medium">—</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Area</span>
                <div className="font-medium">{prospect.area}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Research date</span>
                <div className="font-medium">{fmtDate(prospect.research_date)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Public digital presence</h2>
          <div className="grid gap-3 text-sm">
            <div className="flex items-start justify-between">
              <span className="text-muted-foreground">Booking available</span>
              <Badge tone={prospect.booking_available ? 'success' : 'muted'}>
                {prospect.booking_available ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-muted-foreground">WhatsApp available</span>
              <Badge tone={prospect.whatsapp_available ? 'success' : 'muted'}>
                {prospect.whatsapp_available ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-start gap-2">
              <Star className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Google presence</span>
                {prospect.google_rating !== null ? (
                  <div className="font-medium">
                    {prospect.google_rating} · {prospect.review_count ?? 0} reviews
                  </div>
                ) : (
                  <div className="font-medium">No rating data</div>
                )}
              </div>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-muted-foreground">Content quality</span>
              <Badge tone={prospect.content_quality === 'High' ? 'success' : prospect.content_quality === 'Medium' ? 'warning' : 'muted'}>
                {prospect.content_quality}
              </Badge>
            </div>
            {prospect.visible_advertising && (
              <div>
                <span className="text-muted-foreground">Visible advertising</span>
                <div className="font-medium">{prospect.visible_advertising}</div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Verified facts</h2>
        {verifiedFacts.length > 0 ? (
          <ul className="grid gap-2 text-sm">
            {verifiedFacts.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <div>
                  <span className="text-muted-foreground">{item.label}:</span> <span className="font-medium">{item.value}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No verified facts recorded.</p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Observations / hypotheses</h2>
        <div className="space-y-3 text-sm">
          {prospect.obvious_problem && (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-amber-500" />
              <div>
                <span className="text-xs font-semibold uppercase text-amber-600">Observation</span>
                <p className="font-medium">{prospect.obvious_problem}</p>
              </div>
            </div>
          )}
          {parsedObservations.map((obs, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-amber-500" />
              <div>
                <span className="text-xs font-semibold uppercase text-amber-600">Observation</span>
                <p className="font-medium">{obs}</p>
              </div>
            </div>
          ))}
          {parsedObservations.length === 0 && !prospect.obvious_problem && (
            <p className="text-sm text-muted-foreground">No observations recorded.</p>
          )}
        </div>
      </section>

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

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Audit history</h2>
          <Button size="sm" variant="outline" onClick={() => setAuditModalOpen(true)}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Create audit
          </Button>
        </div>
        {audits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">No audits completed yet.</p>
            <p className="text-xs text-muted-foreground">Create an audit to capture verified digital evidence and recommendations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.map((a) => (
              <Link
                key={a.audit_id}
                to={`/internal/audits/${a.audit_id}`}
                className="flex items-start justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {fmtDate(a.audit_date)}
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  {a.identified_problems && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{a.identified_problems}</p>
                  )}
                  {a.recommendations && (
                    <p className="text-xs text-muted-foreground line-clamp-1">Recommendation: {a.recommendations}</p>
                  )}
                </div>
                <Badge
                  tone={a.overall_opportunity === 'High' ? 'success' : a.overall_opportunity === 'Medium' ? 'warning' : 'muted'}
                >
                  {a.overall_opportunity} opportunity
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Outreach history</h2>
          {outreach.length > 0 && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/internal/outreach">View board <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          )}
        </div>
        {outreach.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">No outreach recorded yet.</p>
            <p className="text-xs text-muted-foreground">Start outreach to begin the sales conversation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedOutreach.map((o) => (
              <div key={o.outreach_id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {o.channel} <span className="text-muted-foreground">·</span> {fmtDate(o.last_contact_at)}
                    <span className="text-muted-foreground">by</span> {o.owner}
                  </div>
                  {o.response && (
                    <p className="text-xs text-muted-foreground">Response: {o.response}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Next: {o.next_action}{o.next_action_at ? ` (${fmtDate(o.next_action_at)})` : ''}</p>
                </div>
                <Badge tone={o.stage === 'Won' ? 'success' : o.stage === 'Lost' ? 'destructive' : 'info'}>
                  {o.stage}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Current status / next action</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Priority</span>
              <Badge tone={priorityTone(prospect.priority)}>{prospect.priority}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Outreach stage</span>
              <Badge tone={latestOutreach ? (latestOutreach.stage === 'Won' ? 'success' : latestOutreach.stage === 'Lost' ? 'destructive' : 'info') : 'muted'}>
                {latestOutreach ? latestOutreach.stage : 'Not started'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Proposals</span>
              <span className="font-medium">{proposals.length}</span>
            </div>
            {proposals.length > 0 && (
              <div className="space-y-1">
                {proposals.map((p) => (
                  <div key={p.proposal_id} className="flex items-center justify-between rounded border p-2">
                    <span className="text-xs">{p.proposed_service} · ₹{p.price_inr.toLocaleString('en-IN')}</span>
                    <Badge tone={p.status === 'Accepted' ? 'success' : p.status === 'Lost' ? 'destructive' : 'info'}>
                      {p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Recommended next action</div>
              <p className="font-medium">{nextAction?.label || '—'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowProposal((v) => !v)}>
                <FileText className="mr-2 h-4 w-4" /> {showProposal ? 'Cancel' : 'Create proposal'}
              </Button>
            </div>
            {showProposal && (
              <ProposalForm
                prospectId={prospect.prospect_id}
                onDone={() => {
                  setShowProposal(false);
                  toast.success('Proposal created');
                }}
              />
            )}
          </div>
        </div>
      </section>

      <AuditFormModal
        prospectId={prospect.prospect_id}
        prospectName={prospect.clinic_name}
        open={auditModalOpen}
        onOpenChange={setAuditModalOpen}
      />
    </div>
  );
}

function OutreachForm({ prospectId, onDone }: { prospectId: string; onDone: () => void }) {
  const recordOutreach = useStore((s) => s.recordOutreach);
  const [channel, setChannel] = useState<'Email' | 'Phone' | 'WhatsApp' | 'InPerson'>('Email');
  const [next_action, setNext] = useState('Send follow-up');
  const [next_action_at, setNextAt] = useState('');
  const [owner, setOwner] = useState('Founder');

  return (
    <div className="mt-2 space-y-2 rounded border bg-muted/20 p-3">
      <div className="space-y-2">
        <Label htmlFor="channel">Channel</Label>
        <Select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as any)}>
          <option>Email</option>
          <option>Phone</option>
          <option>WhatsApp</option>
          <option>InPerson</option>
        </Select>
      </div>
      <Field label="Next action" v={next_action} onChange={setNext} />
      <Field label="Next action at (ISO date-time)" v={next_action_at} onChange={setNextAt} placeholder="2026-09-08T15:00:00.000Z" />
      <Field label="Owner" v={owner} onChange={setOwner} />
      <Button
        size="sm"
        onClick={() => {
          recordOutreach({
            prospect_id: prospectId,
            channel,
            next_action,
            next_action_at: next_action_at || null,
            owner,
          });
          onDone();
        }}
      >
        Record outreach
      </Button>
    </div>
  );
}

function ProposalForm({ prospectId, onDone }: { prospectId: string; onDone: () => void }) {
  const createProposal = useStore((s) => s.createProposal);
  const [problem, setProblem] = useState('');
  const [proposed_service, setService] = useState('90-day Clinic Growth Pilot');
  const [expected_outcomes, setOutcomes] = useState('');
  const [price_inr, setPrice] = useState(75000);
  const [timeline, setTimeline] = useState('90 days');

  return (
    <div className="mt-2 space-y-2 rounded border bg-muted/20 p-3">
      <Field label="Problem / opportunity" v={problem} onChange={setProblem} />
      <Field label="Proposed service" v={proposed_service} onChange={setService} />
      <Field label="Expected outcomes" v={expected_outcomes} onChange={setOutcomes} area />
      <Field label="Price (INR)" v={String(price_inr)} onChange={(x) => setPrice(Number(x) || 0)} />
      <Field label="Timeline" v={timeline} onChange={setTimeline} />
      <Button
        size="sm"
        onClick={() => {
          createProposal({
            prospect_id: prospectId,
            problem,
            proposed_service,
            expected_outcomes,
            price_inr,
            timeline,
          });
          onDone();
        }}
      >
        Save proposal
      </Button>
    </div>
  );
}

function Field({
  label,
  v,
  onChange,
  area,
  placeholder,
}: {
  label: string;
  v: string;
  onChange: (x: string) => void;
  area?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {area ? (
        <Textarea value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}