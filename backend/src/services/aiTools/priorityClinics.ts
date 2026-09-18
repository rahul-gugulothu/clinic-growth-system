import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'priority-clinics';

const contextSchema = z.object({});

export interface PriorityClinic {
  prospectId: string;
  clinicName: string;
  priority: string;
  currentStage: string;
  reason: string;
  nextAction: string;
}

export interface PriorityClinicsResult {
  clinics: PriorityClinic[];
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  priority: string | null;
  updated_at: string;
  notes: string | null;
}

interface AuditRow {
  prospect_id: string;
}

interface OutreachRow {
  prospect_id: string;
  stage: string;
  updated_at: string;
  next_action: string | null;
}

const PRIORITY_SCORE: Record<string, number> = {
  High: 30,
  Medium: 15,
  Low: 0,
};

const STAGE_SCORES: Record<string, number> = {
  'Not contacted': 25,
  Responded: 20,
  'Follow-up due': 20,
  Proposal: 15,
  Lost: -50,
};

export const priorityClinicsTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Priority Clinics',
  description: 'Get top prospects requiring attention',
  tenant_scope: 'org',
  required_context: [],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    _toolContext: AiToolContext
  ): Promise<PriorityClinicsResult> {
    const { organizationId } = execContext;
    const client = await getClient();

    try {
      const prospectsResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, priority, updated_at, notes
         FROM prospects
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const auditsResult = await client.query<AuditRow>(
        `SELECT prospect_id
         FROM audits
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT prospect_id, stage, updated_at, next_action
         FROM outreach
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const prospects = prospectsResult.rows;
      const auditedProspectIds = new Set(
        auditsResult.rows.map((a) => a.prospect_id)
      );

      const outreachByProspect = new Map<string, OutreachRow[]>();
      for (const o of outreachResult.rows) {
        if (!outreachByProspect.has(o.prospect_id)) {
          outreachByProspect.set(o.prospect_id, []);
        }
        outreachByProspect.get(o.prospect_id)!.push(o);
      }

      const scored = prospects.map((p) => {
        let score = 0;
        let stage = 'New';
        let reason = '';

        const priorityScore = PRIORITY_SCORE[p.priority || ''] ?? 0;
        score += priorityScore;
        if (priorityScore > 0) {
          reason = `${p.priority} priority`;
        }

        const pOutreach = outreachByProspect.get(p.id) || [];
        if (pOutreach.length > 0) {
          const latest = pOutreach.sort((a, b) =>
            b.updated_at.localeCompare(a.updated_at)
          )[0];
          stage = latest.stage;

          const stageScore = STAGE_SCORES[latest.stage];
          if (stageScore !== undefined) {
            score += stageScore;
          }

          if (latest.stage === 'Not contacted') {
            if (reason) reason += '; ';
            reason += 'High priority but not contacted';
          } else if (
            latest.stage === 'Responded' ||
            latest.stage === 'Follow-up due'
          ) {
            if (reason) reason += '; ';
            reason += 'Responded, needs follow-up';
          } else if (latest.stage === 'Proposal') {
            if (reason) reason += '; ';
            reason += 'Proposal sent, awaiting decision';
          } else if (latest.stage === 'Lost') {
            if (reason) reason += '; ';
            reason += 'Lost';
          }
        } else {
          score += 20;
          if (reason) reason += '; ';
          reason += 'No outreach yet';
        }

        if (auditedProspectIds.has(p.id)) {
          score += 5;
        }

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(p.updated_at).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysSinceUpdate > 3) score += 5;

        return { prospect: p, score, stage, reason };
      });

      scored.sort((a, b) => b.score - a.score);

      const top5 = scored.slice(0, 5).map((item) => {
        let nextAction = 'Create audit and start outreach';
        if (item.stage === 'Not contacted') {
          nextAction = 'Initiate outreach';
        } else if (item.stage === 'Responded' || item.stage === 'Follow-up due') {
          nextAction = 'Schedule call';
        } else if (item.stage === 'Call') {
          nextAction = 'Move to proposal stage';
        } else if (item.stage === 'Proposal') {
          nextAction = 'Follow up on proposal';
        } else if (item.stage === 'Won') {
          nextAction = 'Onboard clinic';
        } else if (item.stage === 'Lost') {
          nextAction = 'Re-engage or archive';
        }

        return {
          prospectId: item.prospect.id,
          clinicName: item.prospect.clinic_name,
          priority: item.prospect.priority || 'Unknown',
          currentStage: item.stage,
          reason: item.reason || 'Standard priority',
          nextAction,
        };
      });

      const result: PriorityClinicsResult = { clinics: top5 };
      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId },
        'priority-clinics tool failed'
      );
      throw err;
    } finally {
      client.release();
    }
  },
};
