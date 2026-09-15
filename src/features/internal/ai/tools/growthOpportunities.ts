import type { ToolDefinition, ToolContext, AIToolResult, GrowthOpportunitiesResult } from '../types';

export const growthOpportunitiesTool: ToolDefinition = {
  id: 'growth-opportunities',
  name: 'Growth Opportunities',
  description: 'Identify evidence-based growth opportunities',
  execute: (context: ToolContext): AIToolResult => {
    const { prospects, audits, outreach, proposals } = context.store;

    const prospectsList = Object.values(prospects) as {
      prospect_id: string;
      clinic_name: string;
      priority: string;
    }[];

    const auditsList = Object.values(audits) as { prospect_id: string }[];
    const outreachList = Object.values(outreach) as {
      prospect_id: string;
      stage: string;
      next_action?: string;
    }[];
    const proposalsList = Object.values(proposals) as {
      prospect_id: string;
      status: string;
    }[];

    const auditedProspectIds = new Set(auditsList.map((a) => a.prospect_id));
    const outreachByProspect = new Map<string, typeof outreachList>();
    for (const o of outreachList) {
      if (!outreachByProspect.has(o.prospect_id)) {
        outreachByProspect.set(o.prospect_id, []);
      }
      outreachByProspect.get(o.prospect_id)!.push(o);
    }

    const opportunities: {
      opportunity: string;
      evidence: string;
      suggestedAction: string;
      confidence: 'high' | 'medium' | 'low';
    }[] = [];

    const untouchedHighPriority = prospectsList.filter(
      (p) => p.priority === 'High' && !outreachByProspect.has(p.prospect_id),
    );
    if (untouchedHighPriority.length > 0) {
      opportunities.push({
        opportunity: 'High-priority prospects without outreach',
        evidence: `${untouchedHighPriority.length} high-priority prospects have not been contacted yet`,
        suggestedAction: 'Initiate outreach to these prospects immediately',
        confidence: 'high',
      });
    }

    const auditedWithoutOutreach = prospectsList.filter(
      (p) => auditedProspectIds.has(p.prospect_id) && !outreachByProspect.has(p.prospect_id),
    );
    if (auditedWithoutOutreach.length > 0) {
      opportunities.push({
        opportunity: 'Audited prospects not yet in outreach',
        evidence: `${auditedWithoutOutreach.length} prospects have been audited but no outreach has been recorded`,
        suggestedAction: 'Start outreach sequence for recently audited prospects',
        confidence: 'high',
      });
    }

    const respondedWithoutAction = outreachList.filter(
      (o) => (o.stage === 'Responded') && (!o.next_action || !o.next_action.trim()),
    );
    if (respondedWithoutAction.length > 0) {
      opportunities.push({
        opportunity: 'Responded prospects without next action',
        evidence: `${respondedWithoutAction.length} prospects have responded but no next action is planned`,
        suggestedAction: 'Schedule follow-up calls for responding prospects',
        confidence: 'high',
      });
    }

    const awaitingDecision = proposalsList.filter((p) => p.status === 'Sent');
    if (awaitingDecision.length > 0) {
      opportunities.push({
        opportunity: 'Proposals awaiting decision',
        evidence: `${awaitingDecision.length} proposals are awaiting prospect decision`,
        suggestedAction: 'Follow up on sent proposals to get decisions',
        confidence: 'high',
      });
    }

    const contactedNotResponded = outreachList.filter(
      (o) => o.stage === 'Contacted',
    );
    if (contactedNotResponded.length > 0) {
      const responseRate = outreachList.filter(
        (o) => ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage),
      ).length;
      const contactRate = outreachList.length;
      if (contactRate > 0 && responseRate / contactRate < 0.3) {
        opportunities.push({
          opportunity: 'Low response rate from outreach',
          evidence: 'Response rate is below 30%. Consider testing different messaging or channels',
          suggestedAction: 'A/B test outreach messages or try a different channel',
          confidence: 'medium',
        });
      }
    }

    const prospectsByPriority = prospectsList.filter((p) => p.priority === 'Medium');
    if (prospectsByPriority.length > 5) {
      opportunities.push({
        opportunity: 'Expand medium-priority pipeline',
        evidence: `${prospectsByPriority.length} medium-priority prospects available for research`,
        suggestedAction: 'Increase prospecting effort to identify more high-priority targets',
        confidence: 'medium',
      });
    }

    const noWinsYet = proposalsList.some((p) => p.status === 'Accepted') === false && proposalsList.length > 0;
    if (noWinsYet && proposalsList.length >= 3) {
      opportunities.push({
        opportunity: 'Pipeline conversion opportunity',
        evidence: `${proposalsList.length} proposals exist but none have converted yet`,
        suggestedAction: 'Review proposal quality and follow-up intensity',
        confidence: 'medium',
      });
    }

    if (opportunities.length === 0) {
      opportunities.push({
        opportunity: 'Build initial pipeline',
        evidence: 'No significant opportunities identified with current data',
        suggestedAction: 'Add more prospects and conduct audits to enable deeper analysis',
        confidence: 'low',
      });
    }

    const result: GrowthOpportunitiesResult = {
      opportunities: opportunities.slice(0, 5),
    };

    return {
      toolId: 'growth-opportunities',
      toolName: 'Growth Opportunities',
      resultType: 'growth_opportunities',
      data: result,
    };
  },
};
