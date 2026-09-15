import type { ToolDefinition, ToolContext, AIToolResult, PipelineDiagnosisResult } from '../types';

export const pipelineDiagnosisTool: ToolDefinition = {
  id: 'pipeline-diagnosis',
  name: 'Pipeline Diagnosis',
  description: 'Analyze the acquisition pipeline for bottlenecks',
  execute: (context: ToolContext): AIToolResult => {
    const { prospects, audits, outreach, proposals } = context.store;

    const prospectsList = Object.values(prospects);
    const auditsList = Object.values(audits);
    const outreachList = Object.values(outreach) as { stage: string; prospect_id: string }[];
    const proposalsList = Object.values(proposals) as { status: string; prospect_id?: string }[];

    const auditedProspectIds = new Set(auditsList.map((a: unknown) => (a as { prospect_id: string }).prospect_id));

    const stages: Record<string, number> = {
      'Not contacted': 0,
      'Contacted': 0,
      'Responded': 0,
      'Follow-up due': 0,
      'Call': 0,
      'Proposal': 0,
      'Won': 0,
      'Lost': 0,
    };

    for (const o of outreachList) {
      if (stages[o.stage] !== undefined) {
        stages[o.stage]++;
      }
    }

    const prospectsWithoutOutreach = prospectsList.filter(
      (p: unknown) => !outreachList.some((o) => o.prospect_id === (p as { prospect_id: string }).prospect_id),
    );
    stages['Not contacted'] = prospectsWithoutOutreach.length;

    const sentProposals = proposalsList.filter((p) =>
      ['Sent', 'Accepted'].includes(p.status),
    ).length;
    stages['Proposal'] = Math.max(stages['Proposal'], sentProposals);

    const stageCounts = [
      { name: 'Prospects', count: prospectsList.length },
      { name: 'Audited', count: auditedProspectIds.size },
      { name: 'Contacted', count: stages['Contacted'] + stages['Responded'] + stages['Follow-up due'] + stages['Call'] + stages['Proposal'] + stages['Won'] + stages['Lost'] },
      { name: 'Responded', count: stages['Responded'] + stages['Follow-up due'] + stages['Call'] + stages['Proposal'] + stages['Won'] },
      { name: 'Call', count: stages['Call'] + stages['Proposal'] + stages['Won'] },
      { name: 'Proposal', count: sentProposals },
      { name: 'Won', count: stages['Won'] },
    ];

    const maxCount = stageCounts[0].count;
    const withPct = stageCounts.map((s) => ({
      ...s,
      pct: maxCount > 0 ? Math.round((s.count / maxCount) * 100) : 0,
    }));

    let bottleneck: { from: string; to: string; dropoff: number } | null = null;
    let maxDropoff = 0;

    for (let i = 0; i < withPct.length - 1; i++) {
      const current = withPct[i];
      const next = withPct[i + 1];
      if (current.count > 0) {
        const dropoff = current.count - next.count;
        if (dropoff > maxDropoff) {
          maxDropoff = dropoff;
          bottleneck = { from: current.name, to: next.name, dropoff };
        }
      }
    }

    let recommendation = 'Pipeline is empty. Add prospects to see recommendations.';
    if (prospectsList.length > 0) {
      if (auditedProspectIds.size === 0) {
        recommendation = 'No audits completed yet. Create audits for high-priority prospects to understand their challenges.';
      } else if (stages['Not contacted'] > prospectsList.length * 0.5) {
        recommendation = 'Many prospects are not contacted. Prioritize outreach to audited prospects.';
      } else if (stages['Contacted'] > 0 && stages['Responded'] === 0) {
        recommendation = 'No responses from contacted prospects. Review outreach approach and messaging.';
      } else if (bottleneck && bottleneck.dropoff > 3) {
        recommendation = `Biggest drop-off: ${bottleneck.from} → ${bottleneck.to}. Focus on improving this transition.`;
      } else if (sentProposals > 0 && stages['Won'] === 0) {
        recommendation = 'Proposals are being sent but not converting. Review proposal quality and follow-up process.';
      } else if (stages['Won'] > 0) {
        recommendation = 'Pipeline is converting to wins. Continue current approach and scale outreach.';
      } else {
        recommendation = 'Pipeline is progressing well. Continue nurturing prospects through each stage.';
      }
    }

    const result: PipelineDiagnosisResult = {
      stages: withPct,
      bottleneck,
      recommendation,
    };

    return {
      toolId: 'pipeline-diagnosis',
      toolName: 'Pipeline Diagnosis',
      resultType: 'pipeline_diagnosis',
      data: result,
    };
  },
};
