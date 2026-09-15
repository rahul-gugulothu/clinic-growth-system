import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { ArrowRight, FileText, Send, CheckCircle2, XCircle, AlertTriangle, Lightbulb, Filter, Plus, Calendar, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, selectAllProposals } from '@/store';
import { PROPOSAL_STATUSES, type ProposalStatus } from '@/types/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { fmtCurrency, fmtDateTime } from '@/lib/format';
import { ProposalFormModal } from '@/components/sales/ProposalFormModal';

export default function SalesProposalsPage() {
  const proposals = useStore(selectAllProposals);
  const getProspect = useStore((s) => s.prospects);
  const setProposalStatus = useStore((s) => s.setProposalStatus);
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<ReturnType<typeof useStore.getState>['proposals'][string] | null>(null);

  const selectedProposal = useMemo(
    () => proposals.find((p) => p.proposal_id === selectedId) || null,
    [proposals, selectedId]
  );

  const selectedProspect = useMemo(
    () => (selectedProposal?.prospect_id ? getProspect[selectedProposal.prospect_id] : undefined),
    [selectedProposal, getProspect]
  );

  const selectedOutreach = useMemo(() => {
    if (!selectedProposal?.prospect_id) return null;
    const outreach = useStore.getState();
    const records = Object.values(outreach.outreach).filter((o) => o.prospect_id === selectedProposal.prospect_id);
    return records.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] || null;
  }, [selectedProposal]);

  const totalProposals = proposals.length;
  const awaitingDecision = proposals.filter((p) => p.status === 'Sent').length;
  const acceptedCount = proposals.filter((p) => p.status === 'Accepted').length;
  const pipelineValue = proposals.filter((p) => p.status !== 'Lost').reduce((sum, p) => sum + p.price_inr, 0);

  const needsAttention = useMemo(() => {
    const items: { proposal: typeof proposals[0]; reason: string }[] = [];
    for (const p of proposals) {
      if (p.status === 'Sent') {
        items.push({ proposal: p, reason: 'Awaiting decision' });
      } else if (p.status === 'Draft') {
        items.push({ proposal: p, reason: 'Draft not sent' });
      } else if (p.status === 'Accepted' && p.prospect_id) {
        const clinic = Object.values(useStore.getState().clinics).find((c) => c.prospect_id === p.prospect_id);
        if (!clinic) {
          items.push({ proposal: p, reason: 'Accepted, awaiting onboarding' });
        }
      }
    }
    return items;
  }, [proposals]);

  const handleMoveStage = (proposalId: string, status: ProposalStatus) => {
    try {
      setProposalStatus(proposalId, status);
      toast.success(`Proposal marked ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const handleConvertToClinic = () => {
    if (!selectedProposal || !selectedProspect) return;
    navigate(`/onboarding/${selectedProspect.prospect_id}`);
  };

  const handleEdit = (proposal: typeof proposals[0]) => {
    setEditingProposal(proposal);
  };

  const handleCreate = () => {
    setEditingProposal(null);
  };

  const filteredProposals = useMemo(() => {
    if (!statusFilter) return proposals;
    return proposals.filter((p) => p.status === statusFilter);
  }, [proposals, statusFilter]);

  const filteredDrafts = filteredProposals.filter((p) => p.status === 'Draft');
  const filteredSent = filteredProposals.filter((p) => p.status === 'Sent');
  const filteredAccepted = filteredProposals.filter((p) => p.status === 'Accepted');
  const filteredLost = filteredProposals.filter((p) => p.status === 'Lost');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales & Proposals</h1>
          <p className="text-sm text-muted-foreground">Commercial pipeline and proposal handoff</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="default">{totalProposals} proposals</Badge>
          <Badge tone="warning">{awaitingDecision} awaiting decision</Badge>
          <Badge tone="success">{acceptedCount} accepted</Badge>
          <Badge tone="info">Pipeline: {fmtCurrency(pipelineValue)}</Badge>
        </div>
      </div>

      {needsAttention.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {needsAttention.map(({ proposal: p, reason }) => {
              const prospect = p.prospect_id ? getProspect[p.prospect_id] : null;
              return (
                <button
                  key={p.proposal_id}
                  type="button"
                  onClick={() => setSelectedId(p.proposal_id)}
                  className={cn(
                    'flex w-72 shrink-0 flex-col gap-1 rounded-md border bg-card p-3 text-left text-sm transition-colors hover:bg-accent',
                    selectedId === p.proposal_id && 'ring-2 ring-primary'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{prospect?.clinic_name ?? '—'}</span>
                    <Badge tone={p.status === 'Sent' ? 'warning' : p.status === 'Accepted' ? 'success' : 'muted'} className="text-xs">
                      {p.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{reason}</div>
                  <div className="text-xs text-muted-foreground">{fmtCurrency(p.price_inr)} · {p.timeline}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase text-muted-foreground">Filter</span>
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-32">
          <option value="">All statuses</option>
          {PROPOSAL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        {(statusFilter) && (
          <Button size="sm" variant="ghost" onClick={() => setStatusFilter('')}>
            Clear
          </Button>
        )}
        <Button size="sm" onClick={() => { handleCreate(); setCreateModalOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> New proposal
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PipelineColumn title="Draft" proposals={filteredDrafts} onSelect={setSelectedId} selectedId={selectedId} getProspect={getProspect} onEdit={handleEdit} onMoveStage={handleMoveStage} tone="muted" />
        <PipelineColumn title="Sent" proposals={filteredSent} onSelect={setSelectedId} selectedId={selectedId} getProspect={getProspect} onEdit={handleEdit} onMoveStage={handleMoveStage} tone="info" />
        <PipelineColumn title="Accepted" proposals={filteredAccepted} onSelect={setSelectedId} selectedId={selectedId} getProspect={getProspect} onEdit={handleEdit} onMoveStage={handleMoveStage} tone="success" />
        <PipelineColumn title="Lost" proposals={filteredLost} onSelect={setSelectedId} selectedId={selectedId} getProspect={getProspect} onEdit={handleEdit} onMoveStage={handleMoveStage} tone="destructive" />
      </div>

      {proposals.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No proposals yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Create a proposal from a prospect profile to start the commercial pipeline.
          </CardContent>
        </Card>
      )}

      {selectedProposal && selectedProspect && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedId(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l bg-background shadow-lg">
            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Proposal</h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={selectedProposal.status === 'Accepted' ? 'success' : selectedProposal.status === 'Lost' ? 'destructive' : selectedProposal.status === 'Sent' ? 'info' : 'muted'}>
                  {selectedProposal.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{selectedProposal.proposal_id}</span>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Clinic</span>
                    <div className="font-medium">{selectedProspect.clinic_name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Proposed service</span>
                    <div className="font-medium">{selectedProposal.proposed_service}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Problem / opportunity</span>
                    <div className="font-medium whitespace-pre-wrap">{selectedProposal.problem || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Expected outcomes</span>
                    <div className="font-medium whitespace-pre-wrap">{selectedProposal.expected_outcomes || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Price</span>
                    <div className="font-medium">{fmtCurrency(selectedProposal.price_inr)}</div>
                    <div className="text-xs text-muted-foreground">Proposal value, not revenue</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Timeline</span>
                    <div className="font-medium">{selectedProposal.timeline || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <div className="font-medium">{fmtDateTime(selectedProposal.created_at)}</div>
                  </div>
                </div>
                {selectedProposal.accepted_at && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground">Accepted</span>
                      <div className="font-medium">{fmtDateTime(selectedProposal.accepted_at)}</div>
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
                {selectedOutreach && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/internal/outreach`}>
                      <Send className="mr-1 h-4 w-4" /> Outreach
                    </Link>
                  </Button>
                )}
              </div>

              {selectedProposal.prospect_id && (
                <Button
                  size="sm"
                  variant="outline"
                   onClick={() => navigate('/internal/ai', { state: { prospectId: selectedProposal.prospect_id, tool: 'generate-proposal', returnTo: { pathname: '/internal/sales' } } })}
                >
                  <Sparkles className="mr-1 h-4 w-4" /> Generate Proposal Draft
                </Button>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedProposal.status === 'Draft' && (
                    <>
                      <Button size="sm" onClick={() => handleEdit(selectedProposal)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleMoveStage(selectedProposal.proposal_id, 'Sent')}>
                        <Send className="mr-1 h-4 w-4" /> Send
                      </Button>
                    </>
                  )}
                  {selectedProposal.status === 'Sent' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleMoveStage(selectedProposal.proposal_id, 'Accepted')}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Mark accepted
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleMoveStage(selectedProposal.proposal_id, 'Lost')}>
                        <XCircle className="mr-1 h-4 w-4" /> Mark lost
                      </Button>
                    </>
                  )}
                  {selectedProposal.status === 'Accepted' && (
                    <Button size="sm" onClick={handleConvertToClinic}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Convert to clinic
                    </Button>
                  )}
                  {selectedProposal.status === 'Lost' && (
                    <p className="text-xs text-muted-foreground">This proposal is closed. No active commercial actions.</p>
                  )}
                </div>
              </div>

              {selectedProposal.status === 'Accepted' && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Accepted — ready for onboarding
                  </div>
                  <Button size="sm" className="mt-2" onClick={handleConvertToClinic}>
                    Convert to clinic
                  </Button>
                </div>
              )}

              {selectedProposal.status === 'Lost' && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-red-800">
                    <XCircle className="h-4 w-4" />
                    Closed — lost
                  </div>
                  <p className="mt-1 text-xs text-red-700">No active commercial actions recommended for lost proposals.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ProposalFormModal
        prospectId={selectedProspect?.prospect_id || ''}
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        proposal={editingProposal}
        onDone={() => setEditingProposal(null)}
      />
    </div>
  );
}

function PipelineColumn({
  title,
  proposals,
  onSelect,
  selectedId,
  getProspect,
  onEdit,
  onMoveStage,
  tone,
}: {
  title: string;
  proposals: ReturnType<typeof useStore.getState>['proposals'][string][];
  onSelect: (id: string) => void;
  selectedId: string | null;
  getProspect: ReturnType<typeof useStore.getState>['prospects'];
  onEdit: (p: ReturnType<typeof useStore.getState>['proposals'][string]) => void;
  onMoveStage: (id: string, status: ProposalStatus) => void;
  tone: 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info';
}) {
  const statusTone = (s: ProposalStatus) =>
    s === 'Accepted' ? 'success' : s === 'Lost' ? 'destructive' : s === 'Sent' ? 'info' : 'muted';

  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <Badge tone={tone}>{proposals.length}</Badge>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        {proposals.map((p) => {
          const prospect = p.prospect_id ? getProspect[p.prospect_id] : null;
          const isSelected = selectedId === p.proposal_id;
          return (
            <button
              key={p.proposal_id}
              type="button"
              onClick={() => onSelect(p.proposal_id)}
              className={cn(
                'block w-full min-w-0 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent',
                isSelected && 'ring-2 ring-primary'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{prospect?.clinic_name ?? '—'}</span>
                <Badge tone={statusTone(p.status)} className="text-xs">{p.status}</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{p.proposed_service}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{fmtCurrency(p.price_inr)}</span>
                <span>{p.timeline}</span>
              </div>
              <div className="mt-2 flex gap-1">
                {p.status === 'Draft' && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                      Edit
                    </Button>
                    <Button size="sm" className="h-7 flex-1 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onMoveStage(p.proposal_id, 'Sent'); }}>
                      Send
                    </Button>
                  </>
                )}
                {p.status === 'Sent' && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onMoveStage(p.proposal_id, 'Accepted'); }}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 flex-1 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onMoveStage(p.proposal_id, 'Lost'); }}>
                      Lost
                    </Button>
                  </>
                )}
                {p.status === 'Accepted' && (
                  <Button size="sm" className="h-7 w-full px-2 text-xs" onClick={(e) => { e.stopPropagation(); onMoveStage(p.proposal_id, 'Accepted'); }}>
                    Convert
                  </Button>
                )}
              </div>
            </button>
          );
        })}
        {proposals.length === 0 && (
          <div className="min-w-0 rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            No items
          </div>
        )}
      </div>
    </div>
  );
}
