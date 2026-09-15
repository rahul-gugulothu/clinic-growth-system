import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, selectAllProspects, selectAllAudits, selectAllOutreach, selectAllProposals, selectClinics } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Users, FileText, CheckCircle2, XCircle, Clock, ArrowRight, TrendingDown, Zap, Target, Layers, Sparkles } from 'lucide-react';
import { fmtCurrency } from '@/lib/format';
import { OUTREACH_STAGES } from '@/types/status';

interface FunnelStage {
  label: string;
  count: number;
  href?: string;
}

  interface ConversionStep {
    from: string;
    to: string;
    count: number;
    total: number;
    pct: number;
    isBottleneck?: boolean;
    dropoff?: number;
  }

interface Observation {
  icon: typeof TrendingDown;
  label: string;
  detail: string;
  severity: 'warning' | 'info' | 'success';
}

export default function ReportsPage() {
  const prospects = useStore(selectAllProspects);
  const audits = useStore(selectAllAudits);
  const outreach = useStore(selectAllOutreach);
  const proposals = useStore(selectAllProposals);
  const clinics = useStore(selectClinics);



  const auditedCount = useMemo(() => new Set(audits.map((a) => a.prospect_id)).size, [audits]);
  const contactedCount = useMemo(() => new Set(outreach.filter((o) => OUTREACH_STAGES.indexOf(o.stage) >= OUTREACH_STAGES.indexOf('Contacted')).map((o) => o.prospect_id)).size, [outreach]);
  const respondedCount = useMemo(() => new Set(outreach.filter((o) => ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage)).map((o) => o.prospect_id)).size, [outreach]);
  const callCount = useMemo(() => new Set(outreach.filter((o) => ['Call', 'Proposal', 'Won'].includes(o.stage)).map((o) => o.prospect_id)).size, [outreach]);
  const proposalStageCount = useMemo(() => new Set(outreach.filter((o) => ['Proposal', 'Won'].includes(o.stage)).map((o) => o.prospect_id)).size, [outreach]);

  const sentProposals = proposals.filter((p) => ['Sent', 'Accepted'].includes(p.status));
  const acceptedProposals = proposals.filter((p) => p.status === 'Accepted');
  const lostProposals = proposals.filter((p) => p.status === 'Lost');
  const draftProposals = proposals.filter((p) => p.status === 'Draft');

  const wonProposalProspectIds = useMemo(() => new Set(acceptedProposals.map((p) => p.prospect_id)), [acceptedProposals]);
  const wonClinicProspectIds = useMemo(() => new Set(clinics.filter((c) => c.prospect_id).map((c) => c.prospect_id!)), [clinics]);
  const uniqueWonProspectIds = useMemo(() => new Set([...wonProposalProspectIds, ...wonClinicProspectIds]), [wonProposalProspectIds, wonClinicProspectIds]);
  const wonCount = uniqueWonProspectIds.size;

  const pipelineValue = proposals
    .filter((p) => p.status !== 'Lost')
    .reduce((sum, p) => sum + p.price_inr, 0);
  const wonValue = acceptedProposals.reduce((sum, p) => sum + p.price_inr, 0);
  const activeProposalValue = sentProposals
    .filter((p) => p.status !== 'Accepted')
    .reduce((sum, p) => sum + p.price_inr, 0);

  const funnelStages: FunnelStage[] = [
    { label: 'Prospects', count: prospects.length, href: '/internal/prospects' },
    { label: 'Audited', count: auditedCount, href: auditedCount > 0 ? '/internal/audits' : undefined },
    { label: 'Contacted', count: contactedCount, href: contactedCount > 0 ? '/internal/outreach' : undefined },
    { label: 'Responded', count: respondedCount, href: respondedCount > 0 ? '/internal/outreach' : undefined },
    { label: 'Call', count: callCount, href: callCount > 0 ? '/internal/outreach' : undefined },
    { label: 'Proposal', count: sentProposals.length, href: sentProposals.length > 0 ? '/internal/sales' : undefined },
    { label: 'Won', count: wonCount, href: wonCount > 0 ? '/clinic' : undefined },
  ];

  const conversions: ConversionStep[] = [
    {
      from: 'Prospects',
      to: 'Audited',
      count: auditedCount,
      total: prospects.length,
      pct: prospects.length > 0 ? Math.round((auditedCount / prospects.length) * 100) : 0,
    },
    {
      from: 'Audited',
      to: 'Contacted',
      count: contactedCount,
      total: auditedCount || prospects.length,
      pct: (auditedCount || prospects.length) > 0 ? Math.round((contactedCount / (auditedCount || prospects.length)) * 100) : 0,
    },
    {
      from: 'Contacted',
      to: 'Responded',
      count: respondedCount,
      total: contactedCount,
      pct: contactedCount > 0 ? Math.round((respondedCount / contactedCount) * 100) : 0,
    },
    {
      from: 'Responded',
      to: 'Call',
      count: callCount,
      total: respondedCount,
      pct: respondedCount > 0 ? Math.round((callCount / respondedCount) * 100) : 0,
    },
    {
      from: 'Call',
      to: 'Proposal',
      count: sentProposals.length,
      total: callCount,
      pct: callCount > 0 ? Math.round((sentProposals.length / callCount) * 100) : 0,
    },
    {
      from: 'Proposal',
      to: 'Won',
      count: wonCount,
      total: sentProposals.length || proposalStageCount,
      pct: (sentProposals.length || proposalStageCount) > 0
        ? Math.round((wonCount / (sentProposals.length || proposalStageCount)) * 100)
        : 0,
    },
  ].map((c, i, arr) => {
    const next = arr[i + 1];
    const isBottleneck = c.total > 0 && c.pct < 30 && next && next.pct < 50;
    return { ...c, isBottleneck };
  });

  const channelOutreach = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of outreach) {
      counts[o.channel] = (counts[o.channel] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);
  }, [outreach]);

  const ownerOutreach = useMemo(() => {
    const counts: Record<string, number> = {};
    const responses: Record<string, number> = {};
    for (const o of outreach) {
      counts[o.owner] = (counts[o.owner] || 0) + 1;
      if (['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage)) {
        responses[o.owner] = (responses[o.owner] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([owner, count]) => ({ owner, count, responses: responses[owner] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [outreach]);

  const observations: Observation[] = useMemo(() => {
    const obs: Observation[] = [];

    if (prospects.length === 0) {
      obs.push({ icon: Layers, label: 'No prospects yet', detail: 'Add prospects to see pipeline analytics', severity: 'info' });
      return obs;
    }

    const biggestDropoff = conversions.reduce(
      (best, c) => {
        if (c.total === 0) return best;
        const dropoff = 100 - c.pct;
        return dropoff > (best.dropoff ?? 0) ? { ...c, dropoff } : best;
      },
      { dropoff: 0, from: '', to: '', count: 0, total: 0, pct: 0, isBottleneck: false },
    );

    if ((biggestDropoff.dropoff ?? 0) > 0 && biggestDropoff.total > 0) {
      obs.push({
        icon: TrendingDown,
        label: `Biggest drop-off: ${biggestDropoff.from} → ${biggestDropoff.to}`,
        detail: `${biggestDropoff.dropoff}% of prospects dropped at this stage (${biggestDropoff.count} of ${biggestDropoff.total})`,
        severity: 'warning',
      });
    }

    const responseRate = conversions.find((c) => c.from === 'Contacted');
    if (responseRate && responseRate.total > 2) {
      if (responseRate.pct < 40) {
        obs.push({
          icon: Zap,
          label: 'Response bottleneck',
          detail: `Only ${responseRate.pct}% of contacted prospects responded. Consider outreach channel optimization.`,
          severity: 'warning',
        });
      } else {
        obs.push({
          icon: Zap,
          label: 'Response rate healthy',
          detail: `${responseRate.pct}% of contacted prospects responded.`,
          severity: 'success',
        });
      }
    }

    const proposalConversion = conversions.find((c) => c.from === 'Proposal');
    if (proposalConversion && proposalConversion.total > 0) {
      if (proposalConversion.pct >= 50) {
        obs.push({
          icon: Target,
          label: 'Proposal conversion strong',
          detail: `${proposalConversion.pct}% of proposals resulted in wins.`,
          severity: 'success',
        });
      } else if (proposalConversion.pct > 0) {
        obs.push({
          icon: Target,
          label: 'Proposal conversion opportunity',
          detail: `${proposalConversion.pct}% win rate on proposals. Proposal quality or pricing may need review.`,
          severity: 'info',
        });
      }
    }

    if (channelOutreach.length > 1) {
      const topChannel = channelOutreach[0];
      const topPct = Math.round((topChannel.count / outreach.length) * 100);
      if (topPct > 70) {
        obs.push({
          icon: Layers,
          label: 'Channel concentration',
          detail: `${topChannel.channel} accounts for ${topPct}% of outreach. Consider diversifying.`,
          severity: 'info',
        });
      }
    }

    return obs.slice(0, 4);
  }, [prospects, conversions, channelOutreach, outreach.length]);

  const winRate = sentProposals.length > 0
    ? Math.round((acceptedProposals.length / sentProposals.length) * 100)
    : null;

  const navigate = useNavigate();

  const hasAnyData = prospects.length > 0 || audits.length > 0 || outreach.length > 0 || proposals.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Acquisition Reports</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline performance and funnel analytics
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate('/internal/ai', { state: { tool: 'pipeline-diagnosis', returnTo: { pathname: '/internal/reports' } } })}
        >
          <Sparkles className="mr-2 h-4 w-4" /> Explain This Funnel
        </Button>
      </div>

      {!hasAnyData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No pipeline data yet</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Add prospects, conduct audits, record outreach, and create proposals to see acquisition analytics here.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/internal/prospects">Add prospects</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/internal/outreach">Record outreach</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active prospects</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{prospects.length}</div>
                <p className="text-xs text-muted-foreground">{auditedCount} audited</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active proposal value</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{fmtCurrency(activeProposalValue)}</div>
                <p className="text-xs text-muted-foreground">
                  {sentProposals.filter((p) => p.status !== 'Accepted').length} active proposals
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Won proposal value</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{fmtCurrency(wonValue)}</div>
                <p className="text-xs text-muted-foreground">{acceptedProposals.length} accepted</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline total</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{fmtCurrency(pipelineValue)}</div>
                <p className="text-xs text-muted-foreground">
                  {proposals.filter((p) => p.status !== 'Lost').length} proposals (excl. lost)
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Acquisition funnel</CardTitle>
              {prospects.length > 0 && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/internal/prospects">
                    View all <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {prospects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No prospects to display.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {funnelStages.map((stage, i) => {
                    const maxCount = funnelStages[0].count;
                    const width = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 4) : 4;
                    return (
                      <div key={stage.label} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-muted-foreground">{stage.label}</div>
                        <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all ${
                              stage.label === 'Won' ? 'bg-green-500/80' : 'bg-primary/80'
                            }`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-sm font-medium">{stage.count}</div>
                        <div className="w-12 text-right text-xs text-muted-foreground">
                          {maxCount > 0 ? `${Math.round((stage.count / maxCount) * 100)}%` : '—'}
                        </div>
                        {i < funnelStages.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Stage conversions</CardTitle>
              </CardHeader>
              <CardContent>
                {conversions.every((c) => c.total === 0) ? (
                  <p className="text-sm text-muted-foreground">No conversion data yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {conversions.map((conv) => (
                      <div
                        key={`${conv.from}-${conv.to}`}
                        className={`flex items-center gap-3 rounded-md border p-2 ${
                          conv.isBottleneck ? 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20' : ''
                        }`}
                      >
                        <div className="flex flex-1 items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{conv.from}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          <span className="font-medium">{conv.to}</span>
                          {conv.isBottleneck && (
                            <Badge tone="warning" className="text-xs">Bottleneck</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold">{conv.pct}%</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({conv.count}/{conv.total})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Outcome summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Won</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="success">{acceptedProposals.length}</Badge>
                      <span className="text-sm font-semibold">{fmtCurrency(wonValue)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Awaiting decision</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="info">{sentProposals.filter((p) => p.status === 'Sent').length}</Badge>
                      <span className="text-sm font-semibold">
                        {fmtCurrency(sentProposals.filter((p) => p.status === 'Sent').reduce((s, p) => s + p.price_inr, 0))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium">Lost</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="destructive">{lostProposals.length}</Badge>
                      <span className="text-sm font-semibold">
                        {fmtCurrency(lostProposals.reduce((s, p) => s + p.price_inr, 0))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Draft</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="muted">{draftProposals.length}</Badge>
                      <span className="text-sm font-semibold">
                        {fmtCurrency(draftProposals.reduce((s, p) => s + p.price_inr, 0))}
                      </span>
                    </div>
                  </div>

                  {winRate !== null && (
                    <div className="mt-2 rounded-md bg-muted/50 p-3 text-center">
                      <span className="text-2xl font-semibold">{winRate}%</span>
                      <span className="ml-2 text-sm text-muted-foreground">proposal win rate</span>
                    </div>
                  )}

                  {proposals.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No proposals yet. Create proposals to track outcomes.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {(channelOutreach.length > 0 || ownerOutreach.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Channel & owner performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  {channelOutreach.length > 0 && (
                    <div>
                      <h4 className="mb-3 text-sm font-medium text-muted-foreground">Outreach by channel</h4>
                      <div className="flex flex-col gap-2">
                        {channelOutreach.map(({ channel, count }) => {
                          const pct = outreach.length > 0 ? Math.round((count / outreach.length) * 100) : 0;
                          return (
                            <div key={channel} className="flex items-center gap-3">
                              <div className="w-20 text-sm">{channel}</div>
                              <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden">
                                <div className="h-full rounded bg-primary/70" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="w-16 text-right text-sm">
                                <span className="font-medium">{count}</span>
                                <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {ownerOutreach.length > 0 && (
                    <div>
                      <h4 className="mb-3 text-sm font-medium text-muted-foreground">Outreach by owner</h4>
                      <div className="flex flex-col gap-2">
                        {ownerOutreach.map(({ owner, count, responses }) => (
                          <div key={owner} className="flex items-center justify-between rounded-md border p-2">
                            <span className="text-sm font-medium">{owner}</span>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">{count} outreach</span>
                              {responses > 0 && (
                                <Badge tone="success" className="text-xs">{responses} responses</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {observations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What the data says</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {observations.map((obs, i) => {
                    const Icon = obs.icon;
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          obs.severity === 'warning'
                            ? 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20'
                            : obs.severity === 'success'
                              ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
                              : ''
                        }`}
                      >
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            obs.severity === 'warning'
                              ? 'text-yellow-600'
                              : obs.severity === 'success'
                                ? 'text-green-600'
                                : 'text-blue-600'
                          }`}
                        />
                        <div>
                          <div className="text-sm font-medium">{obs.label}</div>
                          <div className="text-xs text-muted-foreground">{obs.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Drill-down</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/internal/prospects">
                    <Users className="mr-2 h-4 w-4" />
                    All prospects
                    <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/internal/audits">
                    <FileText className="mr-2 h-4 w-4" />
                    Audits
                    <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/internal/outreach">
                    <FileText className="mr-2 h-4 w-4" />
                    Outreach
                    <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/internal/sales">
                    <FileText className="mr-2 h-4 w-4" />
                    Proposals
                    <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                  </Link>
                </Button>
                {clinics.length > 0 && (
                  <Button asChild variant="outline" className="justify-start">
                    <Link to="/clinic">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Onboarded ({clinics.length})
                      <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
