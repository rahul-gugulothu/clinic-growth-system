import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { Send, Phone, Globe, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, Filter, User, FileText, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, selectAllOutreach, selectAllProposals } from '@/store';
import {
  OUTREACH_STAGES,
  OUTREACH_STAGE_TRANSITIONS,
  type OutreachStage,
} from '@/types/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { fmtDateTime } from '@/lib/format';

export default function OutreachBoardPage() {
  const navigate = useNavigate();
  const outreach = useStore(selectAllOutreach);
  const getProspect = useStore((s) => s.prospects);
  const allProposals = useStore(selectAllProposals);
  const setOutreachStage = useStore((s) => s.setOutreachStage);
  const updateOutreach = useStore((s) => s.updateOutreach);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  const selectedOutreach = useMemo(
    () => outreach.find((o) => o.outreach_id === selectedId) || null,
    [outreach, selectedId]
  );

  const selectedProspect = useMemo(
    () => (selectedOutreach?.prospect_id ? getProspect[selectedOutreach.prospect_id] : undefined),
    [selectedOutreach, getProspect]
  );

  const selectedProposals = useMemo(
    () => (selectedOutreach?.prospect_id ? allProposals.filter((p) => p.prospect_id === selectedOutreach.prospect_id) : []),
    [selectedOutreach, allProposals]
  );

  const activeCount = useMemo(
    () => outreach.filter((o) => !['Won', 'Lost'].includes(o.stage)).length,
    [outreach]
  );

  const followUpDueCount = useMemo(
    () => outreach.filter((o) => o.stage === 'Follow-up due').length,
    [outreach]
  );

  const proposalCount = useMemo(
    () => outreach.filter((o) => o.stage === 'Proposal').length,
    [outreach]
  );

  const wonCount = useMemo(
    () => outreach.filter((o) => o.stage === 'Won').length,
    [outreach]
  );

  const uniqueOwners = useMemo(() => {
    const owners = new Set(outreach.map((o) => o.owner));
    return Array.from(owners).sort();
  }, [outreach]);

  const filteredOutreach = useMemo(() => {
    return outreach.filter((o) => {
      const prospect = o.prospect_id ? getProspect[o.prospect_id] : null;
      if (ownerFilter && o.owner !== ownerFilter) return false;
      if (channelFilter && o.channel !== channelFilter) return false;
      if (stageFilter && o.stage !== stageFilter) return false;
      if (priorityFilter && prospect?.priority !== priorityFilter) return false;
      if (needsAttentionOnly) {
        const isHighPriorityNotContacted = o.stage === 'Not contacted' && prospect?.priority === 'High';
        const isFollowUpDue = o.stage === 'Follow-up due';
        const isRespondedNoNextAction = o.stage === 'Responded' && !o.next_action?.trim();
        const isProposalAwaitingDecision = o.stage === 'Proposal' && selectedProposals.some((p) => ['Draft', 'Sent'].includes(p.status));
        if (!isHighPriorityNotContacted && !isFollowUpDue && !isRespondedNoNextAction && !isProposalAwaitingDecision) {
          return false;
        }
      }
      return true;
    });
  }, [outreach, getProspect, ownerFilter, channelFilter, stageFilter, priorityFilter, needsAttentionOnly, selectedProposals]);

  const byStage = useMemo<Record<OutreachStage, typeof filteredOutreach>>(() => {
    const grouped: Record<OutreachStage, typeof filteredOutreach> = {
      'Not contacted': [],
      Contacted: [],
      Responded: [],
      'Follow-up due': [],
      Call: [],
      Proposal: [],
      Won: [],
      Lost: [],
    };
    for (const o of filteredOutreach) grouped[o.stage].push(o);
    return grouped;
  }, [filteredOutreach]);

  const needsAttention = useMemo(() => {
    const items: { outreach: typeof outreach[0]; reason: string }[] = [];
    for (const o of outreach) {
      const prospect = o.prospect_id ? getProspect[o.prospect_id] : null;
      const proposals = o.prospect_id ? allProposals.filter((p) => p.prospect_id === o.prospect_id) : [];
      if (o.stage === 'Not contacted' && prospect?.priority === 'High') {
        items.push({ outreach: o, reason: 'High priority, not contacted' });
      } else if (o.stage === 'Follow-up due') {
        items.push({ outreach: o, reason: 'Follow-up due' });
      } else if (o.stage === 'Responded' && !o.next_action?.trim()) {
        items.push({ outreach: o, reason: 'Responded, no next action' });
      } else if (o.stage === 'Proposal' && proposals.some((p) => ['Draft', 'Sent'].includes(p.status))) {
        items.push({ outreach: o, reason: 'Proposal awaiting decision' });
      }
    }
    return items;
  }, [outreach, getProspect, allProposals]);

  const handleMoveStage = (outreachId: string, stage: OutreachStage) => {
    try {
      setOutreachStage(outreachId, stage);
      toast.success(`Moved to ${stage}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const handleRecordContact = (outreachId: string, response: string) => {
    updateOutreach(outreachId, {
      response,
      last_contact_at: new Date().toISOString(),
      contact_date: new Date().toISOString(),
    });
    toast.success('Contact recorded');
  };

  const handleScheduleFollowUp = (outreachId: string, nextAction: string, nextActionAt: string | null) => {
    updateOutreach(outreachId, {
      next_action: nextAction,
      next_action_at: nextActionAt,
      stage: 'Follow-up due',
    });
    toast.success('Follow-up scheduled');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
          <p className="text-sm text-muted-foreground">Clinic acquisition pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{activeCount} active</Badge>
          <Badge tone="warning">{followUpDueCount} follow-ups due</Badge>
          <Badge tone="default">{proposalCount} proposals</Badge>
          <Badge tone="success">{wonCount} won</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase text-muted-foreground">Filters</span>
        </div>
        <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="h-8 w-32">
          <option value="">All owners</option>
          {uniqueOwners.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </Select>
        <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="h-8 w-32">
          <option value="">All channels</option>
          <option value="Email">Email</option>
          <option value="Phone">Phone</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="InPerson">InPerson</option>
        </Select>
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="h-8 w-40">
          <option value="">All stages</option>
          {OUTREACH_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-8 w-32">
          <option value="">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </Select>
        <Button
          size="sm"
          variant={needsAttentionOnly ? 'default' : 'outline'}
          onClick={() => setNeedsAttentionOnly((v) => !v)}
        >
          <AlertTriangle className="mr-1 h-4 w-4" />
          Needs attention
        </Button>
        {(ownerFilter || channelFilter || stageFilter || priorityFilter || needsAttentionOnly) && (
          <Button size="sm" variant="ghost" onClick={() => {
            setOwnerFilter('');
            setChannelFilter('');
            setStageFilter('');
            setPriorityFilter('');
            setNeedsAttentionOnly(false);
          }}>
            Clear
          </Button>
        )}
      </div>

      {needsAttention.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {needsAttention.map(({ outreach: o, reason }) => {
              const p = o.prospect_id ? getProspect[o.prospect_id] : null;
              return (
                <button
                  key={o.outreach_id}
                  type="button"
                  onClick={() => setSelectedId(o.outreach_id)}
                  className={cn(
                    'flex w-72 shrink-0 flex-col gap-1 rounded-md border bg-card p-3 text-left text-sm transition-colors hover:bg-accent',
                    selectedId === o.outreach_id && 'ring-2 ring-primary'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{p?.clinic_name ?? '—'}</span>
                    <Badge tone={p?.priority === 'High' ? 'destructive' : p?.priority === 'Medium' ? 'warning' : 'muted'} className="text-xs">
                      {p?.priority ?? '—'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{reason}</div>
                  <div className="text-xs text-muted-foreground">{o.stage} · {o.owner}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <div className="flex w-max items-start gap-3">
          {OUTREACH_STAGES.map((stage) => (
            <div
              key={stage}
              className="flex w-72 shrink-0 flex-col overflow-hidden rounded-md border bg-background"
            >
              <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stage}
                </span>
                <Badge tone="muted">{byStage[stage].length}</Badge>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                {byStage[stage].map((o) => {
                  const p = o.prospect_id ? getProspect[o.prospect_id] : null;
                  const isSelected = selectedId === o.outreach_id;
                  return (
                    <button
                      key={o.outreach_id}
                      type="button"
                      onClick={() => setSelectedId(o.outreach_id)}
                      className={cn(
                        'block w-full min-w-0 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent',
                        isSelected && 'ring-2 ring-primary'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{p?.clinic_name ?? '—'}</span>
                        {p?.priority && (
                          <Badge tone={p.priority === 'High' ? 'destructive' : p.priority === 'Medium' ? 'warning' : 'muted'} className="text-xs">
                            {p.priority}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">
                        {p?.doctor_name ?? '—'} · {p?.area ?? '—'}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{o.channel} · {o.owner}</span>
                      </div>
                      {o.next_action && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          Next: {o.next_action}
                        </div>
                      )}
                      {o.response && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          Response: {o.response}
                        </div>
                      )}
                      <div className="mt-2">
                        <StageActions
                          currentStage={o.stage}
                          onMove={(s) => handleMoveStage(o.outreach_id, s)}
                        />
                      </div>
                    </button>
                  );
                })}
                {byStage[stage].length === 0 && (
                  <div className="min-w-0 rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No items
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {outreach.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No outreach yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Start outreach from a prospect profile to populate this board.
          </CardContent>
        </Card>
      )}

      {selectedOutreach && selectedProspect && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedId(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l bg-background shadow-lg">
            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Outreach record</h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={selectedOutreach.stage === 'Won' ? 'success' : selectedOutreach.stage === 'Lost' ? 'destructive' : 'info'}>
                  {selectedOutreach.stage}
                </Badge>
                <Badge tone={selectedProspect.priority === 'High' ? 'destructive' : selectedProspect.priority === 'Medium' ? 'warning' : 'muted'}>
                  {selectedProspect.priority} priority
                </Badge>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Clinic</span>
                    <div className="font-medium">{selectedProspect.clinic_name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Doctor / Owner</span>
                    <div className="font-medium">{selectedProspect.doctor_name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Channel</span>
                    <div className="font-medium">{selectedOutreach.channel}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Contact date</span>
                    <div className="font-medium">{fmtDateTime(selectedOutreach.contact_date)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Last contact</span>
                    <div className="font-medium">{fmtDateTime(selectedOutreach.last_contact_at)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Next action</span>
                    <div className="font-medium">{selectedOutreach.next_action || '—'}</div>
                    {selectedOutreach.next_action_at && (
                      <div className="text-xs text-muted-foreground">{fmtDateTime(selectedOutreach.next_action_at)}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Owner</span>
                    <div className="font-medium">{selectedOutreach.owner}</div>
                  </div>
                </div>
                {selectedOutreach.response && (
                  <div className="flex items-start gap-2">
                    <Send className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground">Response</span>
                      <div className="font-medium whitespace-pre-wrap">{selectedOutreach.response}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/internal/prospects/${selectedProspect.prospect_id}`}>
                    <ArrowRight className="mr-1 h-4 w-4" /> Prospect Profile
                  </Link>
                </Button>
                {selectedProspect && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/internal/audits?prospectId=${selectedProspect.prospect_id}`}>
                      <FileText className="mr-1 h-4 w-4" /> Audit
                    </Link>
                  </Button>
                )}
                {selectedProposals.length > 0 && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/internal/sales">
                      <TrendingUp className="mr-1 h-4 w-4" /> Proposal
                    </Link>
                  </Button>
                )}
              </div>

              {selectedOutreach.prospect_id && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                     onClick={() => navigate('/internal/ai', { state: { prospectId: selectedOutreach.prospect_id, tool: 'draft-whatsapp', returnTo: { pathname: '/internal/outreach' } } })}
                  >
                    <Sparkles className="mr-1 h-4 w-4" /> Draft WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                     onClick={() => navigate('/internal/ai', { state: { prospectId: selectedOutreach.prospect_id, tool: 'call-preparation', returnTo: { pathname: '/internal/outreach' } } })}
                  >
                    <Sparkles className="mr-1 h-4 w-4" /> Prepare for Contact
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Record contact</h3>
                <div className="space-y-2">
                  <Label htmlFor="contact-response">Response / notes</Label>
                  <Textarea
                    id="contact-response"
                    placeholder="Record response or notes from this contact..."
                    className="min-h-[80px]"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const textarea = document.getElementById('contact-response') as HTMLTextAreaElement | null;
                    if (textarea?.value.trim()) {
                      handleRecordContact(selectedOutreach.outreach_id, textarea.value.trim());
                      textarea.value = '';
                    } else {
                      toast.error('Please enter a response or note');
                    }
                  }}
                >
                  Save contact
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Schedule follow-up</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="followup-action">Next action</Label>
                    <Input id="followup-action" placeholder="e.g. Send proposal" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="followup-date">Date / time</Label>
                    <Input id="followup-date" type="datetime-local" />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const actionInput = document.getElementById('followup-action') as HTMLInputElement | null;
                    const dateInput = document.getElementById('followup-date') as HTMLInputElement | null;
                    const action = actionInput?.value.trim();
                    const date = dateInput?.value;
                    if (!action) {
                      toast.error('Please enter a next action');
                      return;
                    }
                    const isoDate = date ? new Date(date).toISOString() : null;
                    handleScheduleFollowUp(selectedOutreach.outreach_id, action, isoDate);
                    if (actionInput) actionInput.value = '';
                    if (dateInput) dateInput.value = '';
                  }}
                >
                  Schedule follow-up
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Move stage</h3>
                <Select
                  value=""
                  onChange={(e) => {
                    const stage = e.target.value as OutreachStage;
                    if (stage) handleMoveStage(selectedOutreach.outreach_id, stage);
                  }}
                  className="h-9"
                >
                  <option value="">Select next stage…</option>
                  {OUTREACH_STAGE_TRANSITIONS[selectedOutreach.stage].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                {selectedOutreach.stage !== 'Won' && selectedOutreach.stage !== 'Lost' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => handleMoveStage(selectedOutreach.outreach_id, 'Lost')}
                  >
                    <XCircle className="mr-1 h-4 w-4" /> Mark lost
                  </Button>
                )}
              </div>

              {selectedOutreach.stage === 'Won' && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Won — ready for onboarding
                  </div>
                  {selectedProspect && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => navigate(`/onboarding/${selectedProspect.prospect_id}`)}
                    >
                      Convert to clinic
                    </Button>
                  )}
                </div>
              )}

              {selectedOutreach.stage === 'Lost' && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-red-800">
                    <XCircle className="h-4 w-4" />
                    Closed — lost
                  </div>
                  <p className="mt-1 text-xs text-red-700">No active outreach actions recommended for lost records.</p>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</h3>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Created: {fmtDateTime(selectedOutreach.created_at)}</div>
                  <div>Last updated: {fmtDateTime(selectedOutreach.updated_at)}</div>
                  <div>Contact date: {fmtDateTime(selectedOutreach.contact_date)}</div>
                  <div>Last contact: {fmtDateTime(selectedOutreach.last_contact_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StageActions({
  currentStage,
  onMove,
}: {
  currentStage: OutreachStage;
  onMove: (s: OutreachStage) => void;
}) {
  const allowed = OUTREACH_STAGE_TRANSITIONS[currentStage] ?? [];
  const idx = OUTREACH_STAGES.indexOf(currentStage);
  const next = OUTREACH_STAGES[idx + 1];
  const canMarkLost = allowed.includes('Lost');
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {next && allowed.includes(next) && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full min-w-0 justify-center px-2 text-xs"
          onClick={() => onMove(next)}
        >
          <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />
          <span className="truncate">→ {next}</span>
        </Button>
      )}
      {canMarkLost && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-full min-w-0 justify-center px-2 text-xs"
          onClick={() => onMove('Lost')}
        >
          <XCircle className="mr-1 h-3 w-3 shrink-0" />
          <span className="truncate">Mark lost</span>
        </Button>
      )}
    </div>
  );
}
