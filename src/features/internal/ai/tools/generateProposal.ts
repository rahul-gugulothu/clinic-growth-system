import type { ToolDefinition, ToolContext, AIToolResult, ProposalDraftResult } from '../types';

export const generateProposalTool: ToolDefinition = {
  id: 'generate-proposal',
  name: 'Generate Proposal',
  description: 'Generate a proposal draft for a prospect',
  requiresProspect: true,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.prospectId) {
      return {
        toolId: 'generate-proposal',
        toolName: 'Generate Proposal',
        resultType: 'error',
        data: { message: 'No prospect specified. Please select a prospect first.' },
      };
    }

    const { prospects, audits, proposals } = context.store;

    const prospect = (prospects as Record<string, {
      clinic_name: string;
      doctor_name: string;
      specialty: string;
      area: string;
      obvious_problem?: string;
    }>)[context.prospectId];

    if (!prospect) {
      return {
        toolId: 'generate-proposal',
        toolName: 'Generate Proposal',
        resultType: 'error',
        data: { message: `Prospect not found: ${context.prospectId}` },
      };
    }

    const prospectAudits = Object.values(audits).filter(
      (a: unknown) => (a as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { identified_problems?: string; recommendations?: string; overall_opportunity?: string }[];

    const prospectProposals = Object.values(proposals).filter(
      (p: unknown) => (p as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { proposed_service?: string; price_inr?: number; timeline?: string; expected_outcomes?: string }[];

    const existingProposal = prospectProposals[0];

    const scope = prospectAudits[0]?.identified_problems
      ? prospectAudits[0].identified_problems.split('\n').filter(Boolean).slice(0, 3).join(', ')
      : 'Proposed patient acquisition and follow-up workflow improvement, subject to discovery and audit';

    const expectedOutcomes = prospectAudits[0]?.recommendations
      ? prospectAudits[0].recommendations.split('\n').filter(Boolean).slice(0, 3).join(', ')
      : 'Increase qualified enquiry opportunities\nImprove booking conversion\nStrengthen follow-up consistency\nReduce avoidable no-shows';

    const timeline = existingProposal?.timeline || '3-month proposed engagement with monthly reviews';

    const price = existingProposal?.price_inr;

    const assumptions = [
      'Pricing to be confirmed after scope confirmation',
      'Timeline assumes standard implementation complexity',
      'Requires active participation from clinic staff',
      'All approvals will be obtained in writing before proceeding',
    ];

    const nextStep = 'Review draft, adjust scope and pricing, and send to prospect for approval';

    const result: ProposalDraftResult = {
      clinic: prospect.clinic_name,
      scope,
      expectedOutcomes,
      timeline,
      price,
      assumptions,
      nextStep,
    };

    return {
      toolId: 'generate-proposal',
      toolName: 'Generate Proposal',
      resultType: 'proposal_draft',
      data: result,
      requiresHumanReview: true,
    };
  },
};
