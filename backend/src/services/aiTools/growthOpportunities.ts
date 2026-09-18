import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'growth-opportunities';

const contextSchema = z.object({});

export interface GrowthOpportunity {
  opportunity: string;
  evidence: string;
  suggestedAction: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface GrowthOpportunitiesResult {
  opportunities: GrowthOpportunity[];
}

interface ProspectRow {
  id: string;
  clinic_name: string;
  priority: string | null;
}

interface OutreachRow {
  id: string;
  prospect_id: string;
  stage: string;
  next_action: string | null;
}

interface ProposalRow {
  id: string;
  prospect_id: string;
  status: string;
}

interface AuditRow {
  id: string;
  prospect_id: string;
}

interface ClinicRow {
  id: string;
  organization_id: string;
  prospect_id: string;
}

const RESPONSE_STAGES = ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'];

export const growthOpportunitiesTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Growth Opportunities',
  description: 'Identify evidence-based growth opportunities',
  tenant_scope: 'clinic',
  required_context: [],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    _toolContext: AiToolContext
  ): Promise<GrowthOpportunitiesResult> {
    const { organizationId, clinicId } = execContext;
    const client = await getClient();

    try {
      let prospectIds: string[] = [];


      if (clinicId !== null) {
        const clinicResult = await client.query<ClinicRow>(
          `SELECT id, organization_id, prospect_id FROM clinics
           WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [clinicId, organizationId]
        );

        if (clinicResult.rowCount === 0) {
          throw new Error(`Clinic not found: ${clinicId}`);
        }

        const clinic = clinicResult.rows[0];
        prospectIds = [clinic.prospect_id];

      }

      const prospQuery = clinicId !== null
        ? `SELECT id, clinic_name, priority FROM prospects
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND id = ANY($2)`
        : `SELECT id, clinic_name, priority FROM prospects
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const prospectsResult = await client.query<ProspectRow>(
        prospQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const auditsQuery = clinicId !== null
        ? `SELECT id, prospect_id FROM audits
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT id, prospect_id FROM audits
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const auditsResult = await client.query<AuditRow>(
        auditsQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const outreachQuery = clinicId !== null
        ? `SELECT id, prospect_id, stage, next_action FROM outreach
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT id, prospect_id, stage, next_action FROM outreach
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const outreachResult = await client.query<OutreachRow>(
        outreachQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const proposalsQuery = clinicId !== null
        ? `SELECT id, prospect_id, status FROM proposals
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT id, prospect_id, status FROM proposals
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const proposalsResult = await client.query<ProposalRow>(
        proposalsQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const prospectsList = prospectsResult.rows;
      const auditsList = auditsResult.rows;
      const outreachList = outreachResult.rows;
      const proposalsList = proposalsResult.rows;

      const auditedProspectIds = new Set(
        auditsList.map((a) => a.prospect_id)
      );

      const outreachByProspect = new Map<string, OutreachRow[]>();
      for (const o of outreachList) {
        if (!outreachByProspect.has(o.prospect_id)) {
          outreachByProspect.set(o.prospect_id, []);
        }
        outreachByProspect.get(o.prospect_id)!.push(o);
      }

      const opportunities: GrowthOpportunity[] = [];

      const untouchedHighPriority = prospectsList.filter(
        (p) => p.priority === 'High' && !outreachByProspect.has(p.id)
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
        (p) =>
          auditedProspectIds.has(p.id) && !outreachByProspect.has(p.id)
      );
      if (auditedWithoutOutreach.length > 0) {
        opportunities.push({
          opportunity: 'Audited prospects not yet in outreach',
          evidence: `${auditedWithoutOutreach.length} prospects have been audited but no outreach has been recorded`,
          suggestedAction:
            'Start outreach sequence for recently audited prospects',
          confidence: 'high',
        });
      }

      const respondedWithoutNextAction = outreachList.filter(
        (o) =>
          o.stage === 'Responded' && (!o.next_action || !o.next_action.trim())
      );
      if (respondedWithoutNextAction.length > 0) {
        opportunities.push({
          opportunity: 'Responded prospects without next action',
          evidence: `${respondedWithoutNextAction.length} prospects have responded but no next action is planned`,
          suggestedAction:
            'Schedule follow-up calls for responding prospects',
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
        (o) => o.stage === 'Contacted'
      );
      if (contactedNotResponded.length > 0) {
        const responseRate = outreachList.filter((o) =>
          RESPONSE_STAGES.includes(o.stage)
        ).length;
        const contactRate = outreachList.length;
        if (contactRate > 0 && responseRate / contactRate < 0.3) {
          opportunities.push({
            opportunity: 'Low response rate from outreach',
            evidence:
              'Response rate is below 30%. Consider testing different messaging or channels',
            suggestedAction:
              'A/B test outreach messages or try a different channel',
            confidence: 'medium',
          });
        }
      }

      const prospectsByPriority = prospectsList.filter(
        (p) => p.priority === 'Medium'
      );
      if (prospectsByPriority.length > 5) {
        opportunities.push({
          opportunity: 'Expand medium-priority pipeline',
          evidence: `${prospectsByPriority.length} medium-priority prospects available for research`,
          suggestedAction:
            'Increase prospecting effort to identify more high-priority targets',
          confidence: 'medium',
        });
      }

      const noWinsYet =
        proposalsList.some((p) => p.status === 'Accepted') === false &&
        proposalsList.length > 0;
      if (noWinsYet && proposalsList.length >= 3) {
        opportunities.push({
          opportunity: 'Pipeline conversion opportunity',
          evidence: `${proposalsList.length} proposals exist but none have converted yet`,
          suggestedAction:
            'Review proposal quality and follow-up intensity',
          confidence: 'medium',
        });
      }

      if (opportunities.length === 0) {
        opportunities.push({
          opportunity: 'Build initial pipeline',
          evidence:
            'No significant opportunities identified with current data',
          suggestedAction:
            'Add more prospects and conduct audits to enable deeper analysis',
          confidence: 'low',
        });
      }

      const result: GrowthOpportunitiesResult = {
        opportunities: opportunities.slice(0, 5),
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, clinicId },
        'growth-opportunities tool failed'
      );
      throw err;
    } finally {
      client.release();
    }
  },
};