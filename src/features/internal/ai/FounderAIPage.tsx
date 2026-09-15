import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Star, Activity, Trophy, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MorningBriefCard } from './components/MorningBriefCard';
import { ChatWindow } from './components/ChatWindow';
import { ChatComposer } from './components/ChatComposer';
import { SuggestionChips } from './components/SuggestionChips';
import { QuickToolsPanel } from './components/QuickToolsPanel';
import { ContextSidebar } from './components/ContextSidebar';
import { ActivityTimeline } from './components/ActivityTimeline';
import { ActiveContextHeader } from './components/ActiveContextHeader';
import { useFounderChat } from './hooks/useFounderChat';
import { useStore, selectAllProspects, selectAllOutreach, selectAllProposals, selectClinics } from '@/store';
import { OUTREACH_STAGES } from '@/types/status';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FounderAINavigationState } from './types';

export default function FounderAIPage() {
  const store = useStore((s) => ({
    prospects: s.prospects,
    audits: s.audits,
    outreach: s.outreach,
    proposals: s.proposals,
    clinics: s.clinics,
  }));

  const prospects = useStore(selectAllProspects);
  const outreach = useStore(selectAllOutreach);
  const proposals = useStore(selectAllProposals);
  const clinics = useStore(selectClinics);

  const {
    messages,
    inputValue,
    isLoading,
    context,
    sendMessage,
    runTool,
    setInputValue,
    clearChat,
    activities,
  } = useFounderChat(store);

  const location = useLocation();
  const navigate = useNavigate();
  const autoRunRef = useRef<string | null>(null);

  const navState = useMemo(() => (location.state || {}) as FounderAINavigationState, [location.state]);
  const returnTo = navState.returnTo;

  const returnLabel = useMemo(() => {
    if (!returnTo?.pathname) return null;
    const path = returnTo.pathname;
    if (path.startsWith('/internal/prospects/')) return 'Back to Prospect';
    if (path.startsWith('/internal/audits/')) return 'Back to Audit';
    if (path === '/internal/outreach') return 'Back to Outreach';
    if (path === '/internal/sales') return 'Back to Sales';
    if (path === '/internal/reports') return 'Back to Reports';
    return 'Back';
  }, [returnTo]);

  useEffect(() => {
    const incomingProspectId = navState.prospectId;
    const incomingAuditId = navState.auditId;
    const incomingTool = navState.tool;
    const key = incomingAuditId || incomingProspectId;

    if (incomingAuditId && incomingAuditId !== autoRunRef.current) {
      autoRunRef.current = incomingAuditId;
      runTool('audit-summary', undefined, undefined, incomingAuditId);
    } else if (incomingProspectId && incomingProspectId !== autoRunRef.current) {
      autoRunRef.current = incomingProspectId;
      const toolToRun = incomingTool === 'draft-whatsapp' || incomingTool === 'call-preparation' || incomingTool === 'generate-proposal' ? incomingTool : 'prospect-summary';
      runTool(toolToRun, incomingProspectId);
    } else if (incomingTool && !key && incomingTool !== autoRunRef.current) {
      autoRunRef.current = incomingTool;
      runTool(incomingTool);
    }
  }, [location.state, runTool, navState]);

  const [showWelcome, setShowWelcome] = useState(true);

  const handleSend = () => {
    if (inputValue.trim()) {
      setShowWelcome(false);
      sendMessage(inputValue);
    }
  };

  const handleSuggestionSelect = (prompt: string) => {
    setShowWelcome(false);
    sendMessage(prompt);
  };

  const handleToolSelect = (toolId: string) => {
    setShowWelcome(false);
    runTool(toolId);
  };

  const morningBrief = useMemo(() => {
    const highPriorityNotContacted = prospects.filter(
      (p) => p.priority === 'High' && !outreach.some((o) => o.prospect_id === p.prospect_id),
    );

    const followUpDue = outreach.filter((o) => o.stage === 'Follow-up due');
    const proposalsAwaiting = proposals.filter((p) => p.status === 'Sent');

    const needsAttentionCount = highPriorityNotContacted.length + followUpDue.length + proposalsAwaiting.length;

    const opportunitiesCount = proposals.filter((p) => p.status === 'Draft').length +
      outreach.filter((o) => o.stage === 'Responded').length;

    const contactedCount = outreach.filter((o) =>
      OUTREACH_STAGES.indexOf(o.stage) >= OUTREACH_STAGES.indexOf('Contacted'),
    ).length;

    const respondedCount = outreach.filter((o) =>
      ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage),
    ).length;

    const wonCount = proposals.filter((p) => p.status === 'Accepted').length + clinics.length;

    const recentClinics = clinics.filter((c) => {
      const daysSince = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return daysSince <= 7;
    });

    return {
      needsAttention: {
        count: needsAttentionCount,
        text: needsAttentionCount > 0
          ? `${highPriorityNotContacted.length} high-priority prospects not contacted, ${followUpDue.length} follow-ups due, ${proposalsAwaiting.length} proposals awaiting`
          : 'No immediate actions flagged',
      },
      opportunities: {
        count: opportunitiesCount,
        text: opportunitiesCount > 0
          ? `${proposals.filter((p) => p.status === 'Draft').length} draft proposals, ${outreach.filter((o) => o.stage === 'Responded').length} responded prospects`
          : 'No immediate opportunities flagged',
      },
      pipelineHealth: {
        text: `${prospects.length} prospects · ${contactedCount} contacted · ${respondedCount} responded · ${wonCount} won`,
      },
      wins: {
        count: wonCount,
        text: wonCount > 0
          ? `${wonCount} clinic${wonCount > 1 ? 's' : ''} onboarded (${recentClinics.length} this week)`
          : 'No wins yet',
      },
    };
  }, [prospects, outreach, proposals, clinics]);

  const contextKpis = useMemo(() => {
    const pipelineValue = proposals
      .filter((p) => p.status !== 'Lost')
      .reduce((sum, p) => sum + p.price_inr, 0);

    const followUpsDue = outreach.filter((o) => o.stage === 'Follow-up due').length;

    const awaitingDecision = proposals.filter((p) => p.status === 'Sent').length;

    const sentProposals = proposals.filter((p) => ['Sent', 'Accepted'].includes(p.status)).length;
    const acceptedProposals = proposals.filter((p) => p.status === 'Accepted').length;
    const winRate = sentProposals > 0 ? `${Math.round((acceptedProposals / sentProposals) * 100)}%` : 'N/A';

    return {
      pipelineValue,
      activeProspects: prospects.length,
      followUpsDue,
      awaitingDecision,
      winRate,
    };
  }, [prospects, outreach, proposals]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Founder AI</h1>
          <Badge tone="muted" className="text-xs">
            Prototype
          </Badge>
          {returnLabel && returnTo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(returnTo.pathname, { state: returnTo.state })}
              className="gap-1.5 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {returnLabel}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Your clinic acquisition copilot.
        </p>
        <Button variant="outline" onClick={clearChat}>
          <Plus className="mr-2 h-4 w-4" />
          New Conversation
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <QuickToolsPanel onSelectTool={handleToolSelect} selectedProspectId={context.lastProspectId} />

        <div className="flex flex-1 flex-col overflow-hidden border-l bg-muted/20">
          <div className="border-b bg-background px-6 py-3">
            <ActiveContextHeader
              prospectId={context.lastProspectId}
              prospectName={context.lastProspectName}
              auditId={context.lastAuditId}
              onClear={clearChat}
            />
          </div>

          <div className="flex flex-col gap-4 border-b bg-background p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Morning Brief
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MorningBriefCard title="Needs Immediate Attention" icon={Activity}>
                <span className="text-sm text-muted-foreground">{morningBrief.needsAttention.text}</span>
              </MorningBriefCard>
              <MorningBriefCard title="Top Opportunities Today" icon={Star}>
                <span className="text-sm text-muted-foreground">{morningBrief.opportunities.text}</span>
              </MorningBriefCard>
              <MorningBriefCard title="Pipeline Health" icon={Activity}>
                <span className="text-sm text-muted-foreground">{morningBrief.pipelineHealth.text}</span>
              </MorningBriefCard>
              <MorningBriefCard title="Yesterday's Wins" icon={Trophy}>
                <span className="text-sm text-muted-foreground">{morningBrief.wins.text}</span>
              </MorningBriefCard>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {showWelcome && messages.length <= 1 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
                <h2 className="text-xl font-semibold">Good morning Rahul 👋</h2>
                <p className="text-sm text-muted-foreground">
                  Ask Founder AI anything about your clinic acquisition pipeline.
                </p>
                <SuggestionChips onSelect={handleSuggestionSelect} />
              </div>
            ) : (
              <ChatWindow messages={messages} />
            )}

            <ChatComposer
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-muted/20 p-4">
          <ContextSidebar
            pipelineValue={contextKpis.pipelineValue}
            activeProspects={contextKpis.activeProspects}
            followUpsDue={contextKpis.followUpsDue}
            awaitingDecision={contextKpis.awaitingDecision}
            winRate={contextKpis.winRate}
            activeProspectName={context.lastProspectName}
            activeAuditId={context.lastAuditId}
          />
          <ActivityTimeline items={activities} />
        </div>
      </div>
    </div>
  );
}
