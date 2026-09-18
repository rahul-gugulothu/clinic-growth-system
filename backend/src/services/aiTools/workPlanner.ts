import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'work-planner';

const contextSchema = z.object({});

export interface WorkItem {
  task: string;
  reason: string;
}

export interface WorkPlannerResult {
  doNow: WorkItem[];
  doToday: WorkItem[];
  optional: WorkItem[];
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  priority: string | null;
  updated_at: string;
}

interface AuditRow {
  prospect_id: string;
}

interface OutreachRow {
  prospect_id: string;
  stage: string;
  updated_at: string;
  next_action: string | null;
  next_action_at: string | null;
}

interface ProposalRow {
  prospect_id: string;
  status: string;
  price_inr: number | null;
}

interface ClinicRow {
  id: string;
  organization_id: string;
  prospect_id: string;
}

export const workPlannerTool: AiToolDefinition = {
  id: TOOL_ID,
  name: "Today's Work Planner",
  description: 'Generate a prioritized work plan for today',
  tenant_scope: 'clinic',
  required_context: [],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    _toolContext: AiToolContext
  ): Promise<WorkPlannerResult> {
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
          throw new NotFoundError(`Clinic not found: ${clinicId}`);
        }

        prospectIds = [clinicResult.rows[0].prospect_id];
      }

      const prospectsQuery = clinicId !== null
        ? `SELECT id, organization_id, clinic_name, priority, updated_at FROM prospects
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND id = ANY($2)`
        : `SELECT id, organization_id, clinic_name, priority, updated_at FROM prospects
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const prospectsResult = await client.query<ProspectRow>(
        prospectsQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const auditsQuery = clinicId !== null
        ? `SELECT prospect_id FROM audits
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT prospect_id FROM audits
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const auditsResult = await client.query<AuditRow>(
        auditsQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const outreachQuery = clinicId !== null
        ? `SELECT prospect_id, stage, updated_at, next_action, next_action_at FROM outreach
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT prospect_id, stage, updated_at, next_action, next_action_at FROM outreach
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const outreachResult = await client.query<OutreachRow>(
        outreachQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const proposalsQuery = clinicId !== null
        ? `SELECT prospect_id, status, price_inr FROM proposals
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND prospect_id = ANY($2)`
        : `SELECT prospect_id, status, price_inr FROM proposals
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const proposalsResult = await client.query<ProposalRow>(
        proposalsQuery,
        clinicId !== null ? [organizationId, prospectIds] : [organizationId]
      );

      const clinicsQuery = clinicId !== null
        ? `SELECT prospect_id FROM clinics
             WHERE organization_id = $1 AND deleted_at IS NULL
             AND id = $2`
        : `SELECT prospect_id FROM clinics
             WHERE organization_id = $1 AND deleted_at IS NULL`;

      const clinicsResult = await client.query<ClinicRow>(
        clinicsQuery,
        clinicId !== null ? [organizationId, clinicId] : [organizationId]
      );

      const prospects = prospectsResult.rows;
      const auditsList = auditsResult.rows;
      const outreachList = outreachResult.rows;
      const proposalsList = proposalsResult.rows;
      const clinicsList = clinicsResult.rows;

      const auditedProspectIds = new Set(
        auditsList.map((a) => a.prospect_id)
      );

      const today = new Date().toISOString().split('T')[0];

      const doNow: WorkItem[] = [];
      const doToday: WorkItem[] = [];
      const optional: WorkItem[] = [];

      const overdueFollowups = outreachList.filter(
        (o) =>
          o.stage === 'Follow-up due' ||
          (o.next_action_at && o.next_action_at < today)
      );
      for (const o of overdueFollowups.slice(0, 3)) {
        doNow.push({
          task: `Follow up with ${o.prospect_id}`,
          reason: o.next_action || 'Follow-up is overdue',
        });
      }

      const awaitingProposals = proposalsList.filter(
        (p) => p.status === 'Sent'
      );
      for (const _p of awaitingProposals.slice(0, 2)) {
        doNow.push({
          task: 'Follow up on proposal',
          reason: 'Proposal awaiting decision',
        });
      }

      const highPriorityNotAudited = prospects.filter(
        (p) =>
          p.priority === 'High' && !auditedProspectIds.has(p.id)
      );
      for (const p of highPriorityNotAudited.slice(0, 2)) {
        doNow.push({
          task: `Audit ${p.clinic_name}`,
          reason: 'High priority prospect without audit',
        });
      }

      const acceptedNotOnboarded = proposalsList.filter(
        (p) => p.status === 'Accepted'
      );
      const onboardedProspectIds = new Set(
        clinicsList.map((c) => c.prospect_id).filter(Boolean)
      );
      for (const p of acceptedNotOnboarded) {
        if (p.prospect_id && !onboardedProspectIds.has(p.prospect_id)) {
          doNow.push({
            task: 'Onboard clinic from proposal',
            reason: 'Accepted proposal awaiting onboarding',
          });
        }
      }

      const respondedNotMoved = outreachList.filter(
        (o) => o.stage === 'Responded'
      );
      for (const o of respondedNotMoved.slice(0, 2)) {
        doToday.push({
          task: `Schedule call with ${o.prospect_id}`,
          reason: 'Prospect has responded',
        });
      }

      const contactedNotResponded = outreachList.filter(
        (o) => o.stage === 'Contacted'
      );
      for (const o of contactedNotResponded.slice(0, 3)) {
        doToday.push({
          task: `Follow up with ${o.prospect_id}`,
          reason: 'Awaiting response',
        });
      }

      const draftProposals = proposalsList.filter(
        (p) => p.status === 'Draft'
      );
      for (const _p of draftProposals.slice(0, 2)) {
        doToday.push({
          task: 'Finalize proposal draft',
          reason: 'Proposal in draft status',
        });
      }

      const highPriorityNoOutreach = prospects.filter(
        (p) =>
          p.priority === 'High' &&
          !outreachList.some((o) => o.prospect_id === p.id)
      );
      for (const p of highPriorityNoOutreach.slice(0, 3)) {
        optional.push({
          task: `Start outreach to ${p.clinic_name}`,
          reason: 'High priority prospect not contacted',
        });
      }

      const mediumPriority = prospects.filter((p) => p.priority === 'Medium');
      for (const p of mediumPriority.slice(0, 3)) {
        optional.push({
          task: `Research ${p.clinic_name}`,
          reason: 'Medium priority prospect',
        });
      }

      const result: WorkPlannerResult = {
        doNow: doNow.slice(0, 5),
        doToday: doToday.slice(0, 5),
        optional: optional.slice(0, 5),
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, clinicId },
        'work-planner tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      throw new Error(`work-planner tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};