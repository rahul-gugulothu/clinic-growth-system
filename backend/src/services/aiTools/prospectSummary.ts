import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError, BadRequestError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'prospect-summary';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface ProspectSummaryResult {
  prospectId: string;
  clinic: string;
  doctor: string;
  specialty: string;
  area: string;
  priority: string;
  researchSummary: string;
  auditSummary?: string;
  outreachStatus?: string;
  proposalStatus?: string;
  recommendedNextAction: string;
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  priority: string | null;
  notes: string | null;
  google_rating: number | null;
  review_count: number | null;
  website: string | null;
  booking_available: boolean | null;
  whatsapp_available: boolean | null;
  content_quality: string | null;
  visible_advertising: string | null;
}

interface AuditRow {
  id: string;
  prospect_id: string | null;
  overall_opportunity: string | null;
  identified_problems: unknown;
  recommendations: unknown;
}

interface OutreachRow {
  id: string;
  prospect_id: string;
  stage: string;
  channel: string | null;
  last_contact_at: string | null;
  next_action: string | null;
}

interface ProposalRow {
  id: string;
  prospect_id: string;
  status: string;
  price_inr: number | null;
  proposed_service: string | null;
  timeline: string | null;
}

function parseProblems(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.filter((f): f is string => typeof f === 'string');
  }
  if (typeof field === 'string') {
    return field.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const prospectSummaryTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Prospect Summary',
  description: 'Generate a structured summary for a prospect',
  tenant_scope: 'org',
  required_context: ['prospectId'],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<ProspectSummaryResult> {
    const { organizationId } = execContext;
    const prospectId = toolContext.prospectId!;

    const client = await getClient();

    try {
      const prospectResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
                priority, notes, google_rating, review_count, website,
                booking_available, whatsapp_available, content_quality, visible_advertising
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      const auditsResult = await client.query<AuditRow>(
        `SELECT id, prospect_id, overall_opportunity, identified_problems, recommendations
         FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT id, prospect_id, stage, channel, last_contact_at, next_action
         FROM outreach
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY last_contact_at DESC`,
        [prospectId, organizationId]
      );

      const proposalsResult = await client.query<ProposalRow>(
        `SELECT id, prospect_id, status, price_inr, proposed_service, timeline
         FROM proposals
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const researchSummary = prospect.notes
        ? prospect.notes.slice(0, 300)
        : 'No research notes available.';

      let auditSummary: string | undefined;
      if (auditsResult.rowCount && auditsResult.rowCount > 0) {
        const latest = auditsResult.rows[0];
        const problems = parseProblems(latest.identified_problems);
        const problemSummary =
          problems.length > 0
            ? problems.slice(0, 2).join('; ')
            : 'various operational areas';
        auditSummary = `Opportunity: ${latest.overall_opportunity || 'N/A'}. Problems: ${problemSummary}`;
      }

      let outreachStatus: string | undefined;
      if (outreachResult.rowCount && outreachResult.rowCount > 0) {
        const latest = outreachResult.rows[0];
        outreachStatus = `${latest.stage} via ${latest.channel || 'unknown channel'}`;
        if (latest.next_action) {
          outreachStatus += ` — Next: ${latest.next_action}`;
        }
      }

      let proposalStatus: string | undefined;
      if (proposalsResult.rowCount && proposalsResult.rowCount > 0) {
        const latest = proposalsResult.rows[0];
        proposalStatus = latest.status;
        if (latest.price_inr) {
          proposalStatus += ` — ₹${latest.price_inr.toLocaleString('en-IN')}`;
        }
      }

      let recommendedNextAction =
        'Create audit to understand the clinic better';
      if (outreachResult.rowCount && outreachResult.rowCount > 0) {
        const latestStage = outreachResult.rows[0].stage;
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
      const acceptedProposal = proposalsResult.rows.find(
        (p) => p.status === 'Accepted'
      );
      if (acceptedProposal) {
        recommendedNextAction = 'Onboard the clinic';
      }

      const result: ProspectSummaryResult = {
        prospectId: prospect.id,
        clinic: prospect.clinic_name,
        doctor: prospect.doctor_name,
        specialty: prospect.specialty,
        area: prospect.area,
        priority: prospect.priority || 'Unknown',
        researchSummary,
        auditSummary,
        outreachStatus,
        proposalStatus,
        recommendedNextAction,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'prospect-summary tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      if (err instanceof BadRequestError) throw err;
      throw new Error(`prospect-summary tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};
