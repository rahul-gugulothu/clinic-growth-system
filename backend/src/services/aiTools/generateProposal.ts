import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'generate-proposal';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface ProposalDraftResult {
  clinic: string;
  scope: string;
  expectedOutcomes: string;
  timeline: string;
  price?: number;
  assumptions: string[];
  nextStep: string;
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  obvious_problem: string | null;
}

interface AuditRow {
  identified_problems: string | null;
  recommendations: string | null;
  overall_opportunity: string | null;
}

interface ProposalRow {
  prospect_id: string;
  proposed_service: string;
  expected_outcomes: string | null;
  price_inr: number | null;
  timeline: string | null;
}

function parseList(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.filter((f): f is string => typeof f === 'string');
  }
  if (typeof field === 'string') {
    return field.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const generateProposalTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Generate Proposal',
  description: 'Generate a proposal draft for a prospect',
  tenant_scope: 'org',
  required_context: ['prospectId'],
  human_review_required: true,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<ProposalDraftResult> {
    const { organizationId } = execContext;
    const prospectId = toolContext.prospectId!;

    const client = await getClient();

    try {
      const prospectResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, doctor_name, specialty, area, obvious_problem
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      const auditsResult = await client.query<AuditRow>(
        `SELECT identified_problems, recommendations, overall_opportunity
         FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const proposalsResult = await client.query<ProposalRow>(
        `SELECT prospect_id, proposed_service, expected_outcomes, price_inr, timeline
         FROM proposals
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const latestAudit = auditsResult.rowCount
        ? auditsResult.rows[0]
        : null;

      const existingProposal = proposalsResult.rowCount
        ? proposalsResult.rows[0]
        : null;

      const problemsList = parseList(latestAudit?.identified_problems);
      const scope = problemsList.length > 0
        ? problemsList.slice(0, 3).join(', ')
        : 'Proposed patient acquisition and follow-up workflow improvement, subject to discovery and audit';

      const recommendationsList = parseList(latestAudit?.recommendations);
      const expectedOutcomes = recommendationsList.length > 0
        ? recommendationsList.slice(0, 3).join(', ')
        : 'Increase qualified enquiry opportunities\nImprove booking conversion\nStrengthen follow-up consistency\nReduce avoidable no-shows';

      const timeline = existingProposal?.timeline || '3-month proposed engagement with monthly reviews';
      const price = existingProposal?.price_inr || undefined;

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

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'generate-proposal tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      throw new Error(`generate-proposal tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};