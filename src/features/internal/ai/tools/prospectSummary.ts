import type { ToolDefinition, ToolContext, AIToolResult, ProspectSummaryResult } from '../types';

export const prospectSummaryTool: ToolDefinition = {
  id: 'prospect-summary',
  name: 'Prospect Summary',
  description: 'Generate a structured summary for a prospect',
  requiresProspect: true,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.prospectId) {
      return {
        toolId: 'prospect-summary',
        toolName: 'Prospect Summary',
        resultType: 'error',
        data: { message: 'No prospect specified. Please select a prospect first.' },
      };
    }

    const { prospects, audits, outreach, proposals } = context.store;

    const prospect = (prospects as Record<string, {
      prospect_id: string;
      clinic_name: string;
      doctor_name: string;
      specialty: string;
      area: string;
      priority: string;
      notes?: string;
      google_rating?: number | null;
      review_count?: number | null;
      website?: string;
      booking_available?: boolean;
      whatsapp_available?: boolean;
    }>)[context.prospectId];

    if (!prospect) {
      return {
        toolId: 'prospect-summary',
        toolName: 'Prospect Summary',
        resultType: 'error',
        data: { message: `Prospect not found: ${context.prospectId}` },
      };
    }

    const prospectAudits = Object.values(audits).filter(
      (a: unknown) => (a as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { overall_opportunity?: string; identified_problems?: string; recommendations?: string; google_presence?: string }[];

    const prospectOutreach = Object.values(outreach).filter(
      (o: unknown) => (o as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { stage: string; channel?: string; next_action?: string; last_contact_at?: string }[];

    const prospectProposals = Object.values(proposals).filter(
      (p: unknown) => (p as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { status: string; price_inr?: number; proposed_service?: string; timeline?: string }[];

    const researchSummary = prospect.notes
      ? prospect.notes.slice(0, 300)
      : 'No research notes available.';

    let auditSummary = 'No audit recorded for this prospect.';
    if (prospectAudits.length > 0) {
      const latest = prospectAudits[0];
      auditSummary = `Opportunity: ${latest.overall_opportunity || 'N/A'}. Problems: ${latest.identified_problems?.slice(0, 100) || 'N/A'}`;
    }

    let outreachStatus = 'Not contacted';
    if (prospectOutreach.length > 0) {
      const latest = prospectOutreach.sort(
        (a, b) => new Date(b.last_contact_at || 0).getTime() - new Date(a.last_contact_at || 0).getTime(),
      )[0];
      outreachStatus = `${latest.stage} via ${latest.channel || 'unknown channel'}`;
      if (latest.next_action) {
        outreachStatus += ` — Next: ${latest.next_action}`;
      }
    }

    let proposalStatus = 'No proposal';
    if (prospectProposals.length > 0) {
      const latest = prospectProposals[0];
      proposalStatus = `${latest.status}${latest.price_inr ? ` — ₹${latest.price_inr.toLocaleString('en-IN')}` : ''}`;
    }

    let recommendedNextAction = 'Create audit to understand the clinic better';
    if (prospectOutreach.length > 0) {
      const latestStage = prospectOutreach[0].stage;
      if (latestStage === 'Not contacted') {
        recommendedNextAction = 'Initiate outreach via WhatsApp or Email';
      } else if (latestStage === 'Contacted') {
        recommendedNextAction = 'Follow up to get a response';
      } else if (latestStage === 'Responded') {
        recommendedNextAction = 'Schedule a discovery call';
      } else if (latestStage === 'Call') {
        recommendedNextAction = 'Prepare and conduct the call';
      } else if (latestStage === 'Proposal') {
        recommendedNextAction = 'Follow up on proposal decision';
      }
    }
    if (prospectProposals.some((p) => p.status === 'Accepted')) {
      recommendedNextAction = 'Onboard the clinic';
    }

    const result: ProspectSummaryResult = {
      prospectId: prospect.prospect_id,
      clinic: prospect.clinic_name,
      doctor: prospect.doctor_name,
      specialty: prospect.specialty,
      area: prospect.area,
      priority: prospect.priority,
      researchSummary,
      auditSummary: prospectAudits.length > 0 ? auditSummary : undefined,
      outreachStatus: prospectOutreach.length > 0 ? outreachStatus : undefined,
      proposalStatus: prospectProposals.length > 0 ? proposalStatus : undefined,
      recommendedNextAction,
    };

    return {
      toolId: 'prospect-summary',
      toolName: 'Prospect Summary',
      resultType: 'prospect_summary',
      data: result,
    };
  },
};
